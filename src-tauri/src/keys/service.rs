use std::fs;
use std::path::{Path, PathBuf};

use uuid::Uuid;
use zeroize::Zeroizing;

use crate::core::error::{CoreError, CoreResult};
use crate::core::path_guard::{clean_display_path, validate_delete_path};
use crate::infra::db::{key_repo, SqliteDb};
use crate::infra::os::restrict_private_key_dir_acl;
use crate::infra::security::SecretVault;
use crate::ipc::dto::{
    DeleteResultDto, GenerateSshKeyRequestDto, ImportSshKeyRequestDto, SshKeyDto,
    UpdateDefaultKeyResultDto,
};
use crate::keys::{normalize_key_path_input, SshKeyEngine};

#[derive(Clone)]
pub struct KeyService {
    db: SqliteDb,
    vault: SecretVault,
    keys_dir: PathBuf,
}

impl KeyService {
    pub fn new(db: SqliteDb, vault: SecretVault, app_data_dir: &Path) -> CoreResult<Self> {
        let keys_dir = app_data_dir.join("keys");
        fs::create_dir_all(&keys_dir)?;
        let _ = restrict_private_key_dir_acl(&keys_dir);
        Ok(Self {
            db,
            vault,
            keys_dir,
        })
    }

    fn normalized_dir_eq(a: &Path, b: &Path) -> bool {
        let sa = clean_display_path(a);
        let sb = clean_display_path(b);
        #[cfg(windows)]
        {
            sa.eq_ignore_ascii_case(&sb)
        }
        #[cfg(not(windows))]
        {
            sa == sb
        }
    }

    /// Returns true only when `path` resides directly inside canonicalized `self.keys_dir`
    /// and (if present on disk) is a regular non-symlink file.
    fn is_direct_managed_key_file(&self, path: &Path) -> bool {
        let Ok(canon_keys_dir) = fs::canonicalize(&self.keys_dir) else {
            return false;
        };
        let Some(file_name) = path.file_name() else {
            return false;
        };
        if file_name.is_empty() {
            return false;
        }

        match fs::symlink_metadata(path) {
            Ok(meta) => {
                if meta.file_type().is_symlink() || !meta.is_file() {
                    return false;
                }
                let Ok(canon_path) = fs::canonicalize(path) else {
                    return false;
                };
                canon_path
                    .parent()
                    .is_some_and(|p| Self::normalized_dir_eq(p, &canon_keys_dir))
            }
            Err(err) if err.kind() == std::io::ErrorKind::NotFound => path
                .parent()
                .and_then(|p| fs::canonicalize(p).ok())
                .is_some_and(|canon_parent| Self::normalized_dir_eq(&canon_parent, &canon_keys_dir)),
            Err(_) => false,
        }
    }

    pub fn list(&self) -> CoreResult<Vec<SshKeyDto>> {
        let conn = self.db.lock_conn()?;
        key_repo::list(&conn)
    }

    pub fn get_default(&self) -> CoreResult<Option<SshKeyDto>> {
        let conn = self.db.lock_conn()?;
        key_repo::get_default(&conn)
    }

    pub fn generate(&self, req: GenerateSshKeyRequestDto) -> CoreResult<SshKeyDto> {
        let name = {
            let conn = self.db.lock_conn()?;
            key_repo::validate_unique_name(&conn, &req.name)?
        };

        let key_id = Uuid::new_v4().to_string();
        let generated = SshKeyEngine::generate_keypair(
            &self.keys_dir,
            &key_id,
            req.key_type.trim(),
            req.comment.as_deref(),
            req.passphrase.as_deref(),
        )?;

        let mut conn = self.db.lock_conn()?;
        if let Err(err) = key_repo::validate_unique_name(&conn, &name) {
            let _ = fs::remove_file(&generated.private_key_path);
            let _ = fs::remove_file(format!("{}.pub", generated.private_key_path.to_string_lossy()));
            return Err(err);
        }

        let priv_path = generated.private_key_path.to_string_lossy().into_owned();
        self.save_record(
            &mut conn,
            key_repo::NewKeyRecord {
                id: &key_id,
                name: &name,
                key_type: &generated.key_type,
                private_key_path: &priv_path,
                public_key_content: Some(&generated.public_key_content),
                fingerprint: &generated.fingerprint,
                has_passphrase: generated.has_passphrase,
                secret_ref_id: None,
                set_default: req.set_default,
            },
            req.passphrase.as_deref(),
        )
    }

    pub fn import(&self, req: ImportSshKeyRequestDto) -> CoreResult<SshKeyDto> {
        let clean_path = normalize_key_path_input(&req.source_path);
        if clean_path.is_empty() {
            return Err(CoreError::Validation(
                "Private key path cannot be empty".to_string(),
            ));
        }

        let mut conn = self.db.lock_conn()?;
        let name = key_repo::validate_unique_name(&conn, &req.name)?;

        let src_path = Path::new(&clean_path);
        if !src_path.is_file() {
            return Err(CoreError::Validation(format!(
                "Key file not found: {clean_path}"
            )));
        }

        if let Some((_, existing_name)) = key_repo::find_by_path(&conn, &clean_path)? {
            return Err(CoreError::Validation(format!(
                "This key file is already in Vault as \"{existing_name}\"."
            )));
        }

        let has_pw_hint = req.passphrase.as_ref().is_some_and(|p| !p.is_empty());
        let preview = SshKeyEngine::inspect_key_file(src_path, has_pw_hint);

        if let Some(existing_name) = key_repo::find_name_by_fingerprint(&conn, &preview.fingerprint)? {
            return Err(CoreError::Validation(format!(
                "This SSH key already exists in Vault as \"{existing_name}\" (duplicate key fingerprint)."
            )));
        }

        let key_id = Uuid::new_v4().to_string();
        let inspected = SshKeyEngine::import_key_file(
            &self.keys_dir,
            &key_id,
            src_path,
            req.copy_to_managed_dir,
            has_pw_hint,
        )?;

        let priv_path = inspected.private_key_path.to_string_lossy().into_owned();
        self.save_record(
            &mut conn,
            key_repo::NewKeyRecord {
                id: &key_id,
                name: &name,
                key_type: &inspected.key_type,
                private_key_path: &priv_path,
                public_key_content: inspected.public_key_content.as_deref(),
                fingerprint: &inspected.fingerprint,
                has_passphrase: inspected.has_passphrase,
                secret_ref_id: None,
                set_default: req.set_default,
            },
            req.passphrase.as_deref(),
        )
    }

    fn save_record(
        &self,
        conn: &mut rusqlite::Connection,
        rec: key_repo::NewKeyRecord<'_>,
        passphrase: Option<&str>,
    ) -> CoreResult<SshKeyDto> {
        let secret_ref_id = if let Some(pw) = passphrase.filter(|p| !p.is_empty()) {
            let ref_id = SecretVault::key_passphrase_ref(rec.id);
            self.vault.store_secret(&ref_id, pw)?;
            Some(ref_id)
        } else {
            None
        };

        let row = key_repo::NewKeyRecord {
            secret_ref_id: secret_ref_id.as_deref(),
            ..rec
        };
        let res = key_repo::insert(conn, &row);
        if res.is_err() {
            if let Some(ref ref_id) = secret_ref_id {
                let _ = self.vault.delete_secret(ref_id);
            }
        }
        res
    }

    pub fn set_default(&self, key_id: Option<String>) -> CoreResult<UpdateDefaultKeyResultDto> {
        let mut conn = self.db.lock_conn()?;
        key_repo::set_default(&mut conn, key_id)
    }

    pub fn delete(&self, key_id: &str, delete_file_from_disk: bool) -> CoreResult<DeleteResultDto> {
        let conn = self.db.lock_conn()?;
        let key_info = key_repo::get_delete_info(&conn, key_id)?;
        let mut is_managed_key = false;
        if delete_file_from_disk {
            if let Some((ref priv_path, _)) = key_info {
                let target = Path::new(priv_path);
                is_managed_key = self.is_direct_managed_key_file(target);
                if !is_managed_key {
                    validate_delete_path(target)?;
                }
            }
        }
        let affected = key_repo::delete(&conn, key_id)?;

        if let Some((priv_path, secret_ref)) = key_info {
            if let Some(ref_id) = secret_ref {
                let _ = self.vault.delete_secret(&ref_id);
            }
            if delete_file_from_disk {
                let _ = fs::remove_file(&priv_path);
                let pub_path = format!("{priv_path}.pub");
                let pub_target = Path::new(&pub_path);
                let allow_pub_delete = if is_managed_key {
                    self.is_direct_managed_key_file(pub_target)
                } else {
                    validate_delete_path(pub_target).is_ok()
                };
                if allow_pub_delete {
                    let _ = fs::remove_file(pub_target);
                }
            }
        }

        Ok(DeleteResultDto {
            deleted: affected > 0,
        })
    }

    pub fn get_secret(&self, key_id: &str) -> CoreResult<Option<Zeroizing<String>>> {
        let conn = self.db.lock_conn()?;
        if let Some(ref_id) = key_repo::find_secret_ref(&conn, key_id)? {
            return self.vault.get_secret(&ref_id);
        }
        Ok(None)
    }

    pub fn save_secret(&self, key_id: &str, secret: &str) -> CoreResult<()> {
        let ref_id = SecretVault::key_passphrase_ref(key_id);
        self.vault.store_secret(&ref_id, secret)?;
        let conn = self.db.lock_conn()?;
        key_repo::set_saved_secret(&conn, key_id, &ref_id)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn deletes_managed_key_inside_keys_dir_and_rejects_outside_files() {
        let tmp = tempdir().expect("tempdir");
        let db = SqliteDb::init(tmp.path()).expect("init db");
        let vault = SecretVault::new_in_memory();
        let svc = KeyService::new(db, vault, tmp.path()).expect("key service");

        let created = svc
            .generate(GenerateSshKeyRequestDto {
                name: "managed-ed25519".to_string(),
                key_type: "ED25519".to_string(),
                comment: Some("test@coreterm".to_string()),
                passphrase: Some("pass123".to_string()),
                set_default: false,
            })
            .expect("generate key");

        let priv_path = PathBuf::from(&created.private_key_path);
        let pub_path = PathBuf::from(format!("{}.pub", created.private_key_path));
        assert!(priv_path.is_file());
        assert!(pub_path.is_file());
        assert!(svc.is_direct_managed_key_file(&priv_path));
        assert!(svc.is_direct_managed_key_file(&pub_path));

        // Sibling files outside keys_dir (e.g. data/app.db) must never be considered managed keys.
        let db_file = tmp.path().join("data").join("app.db");
        assert!(!svc.is_direct_managed_key_file(&db_file));
        let nested_dir = svc.keys_dir.join("nested");
        fs::create_dir_all(&nested_dir).unwrap();
        let nested_file = nested_dir.join("sub.key");
        fs::write(&nested_file, b"sub").unwrap();
        assert!(!svc.is_direct_managed_key_file(&nested_file));

        let res = svc.delete(&created.id, true).expect("delete managed key");
        assert!(res.deleted);
        assert!(!priv_path.exists());
        assert!(!pub_path.exists());

        // Attempting to delete a key record pointing at a protected OS file must still be blocked.
        #[cfg(windows)]
        let protected_target = std::env::var("WINDIR")
            .map(|w| PathBuf::from(w).join("win.ini"))
            .unwrap_or_else(|_| PathBuf::from(r"C:\Windows\win.ini"));
        #[cfg(not(windows))]
        let protected_target = PathBuf::from("/etc/hosts");

        if protected_target.is_file() {
            let mut conn = svc.db.lock_conn().expect("lock db");
            let protected_str = protected_target.to_string_lossy().into_owned();
            key_repo::insert(
                &mut conn,
                &key_repo::NewKeyRecord {
                    id: "protected-key-ref",
                    name: "protected-ref",
                    key_type: "IMPORTED",
                    private_key_path: &protected_str,
                    public_key_content: None,
                    fingerprint: "SHA256:protected-test",
                    has_passphrase: false,
                    secret_ref_id: None,
                    set_default: false,
                },
            )
            .expect("insert protected key ref");
            drop(conn);

            assert!(
                svc.delete("protected-key-ref", true).is_err(),
                "KeyService::delete must refuse deleting files outside keys_dir in protected dirs"
            );
            assert!(protected_target.is_file());
        }
    }
}

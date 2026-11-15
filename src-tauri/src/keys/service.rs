use std::fs;
use std::path::{Path, PathBuf};

use uuid::Uuid;
use zeroize::Zeroizing;

use crate::core::error::{CoreError, CoreResult};
use crate::infra::db::{key_repo, SqliteDb};
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
        Ok(Self {
            db,
            vault,
            keys_dir,
        })
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
        let affected = key_repo::delete(&conn, key_id)?;

        if let Some((priv_path, secret_ref)) = key_info {
            if let Some(ref_id) = secret_ref {
                let _ = self.vault.delete_secret(&ref_id);
            }
            if delete_file_from_disk {
                let _ = fs::remove_file(&priv_path);
                let _ = fs::remove_file(format!("{priv_path}.pub"));
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

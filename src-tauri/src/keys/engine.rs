use std::fs;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};

#[cfg(windows)]
use std::os::windows::process::CommandExt;

use base64::Engine;
use rand_core::OsRng;
use sha2::{Digest, Sha256};
use ssh_key::{Algorithm, HashAlg, LineEnding, PrivateKey};

use crate::core::error::{CoreError, CoreResult};
use crate::infra::os::restrict_private_key_acl;
#[cfg(windows)]
use crate::infra::os::CREATE_NO_WINDOW;

pub fn normalize_key_path_input(raw: &str) -> String {
    let trimmed = raw.trim();
    if trimmed.len() >= 2 && trimmed.starts_with('"') && trimmed.ends_with('"') {
        trimmed[1..trimmed.len() - 1].trim().to_string()
    } else {
        trimmed.to_string()
    }
}

pub struct GeneratedKeyMaterial {
    pub key_type: String,
    pub private_key_path: PathBuf,
    pub public_key_content: String,
    pub fingerprint: String,
    pub has_passphrase: bool,
}

pub struct InspectedKeyMaterial {
    pub key_type: String,
    pub private_key_path: PathBuf,
    pub public_key_content: Option<String>,
    pub fingerprint: String,
    pub has_passphrase: bool,
}

pub struct SshKeyEngine;

impl SshKeyEngine {
    fn resolve_ssh_keygen_binaries() -> Vec<PathBuf> {
        let mut bins = Vec::new();
        #[cfg(windows)]
        if let Some(windir) = std::env::var_os("WINDIR") {
            let sys_bin = Path::new(&windir)
                .join("System32")
                .join("OpenSSH")
                .join("ssh-keygen.exe");
            if sys_bin.exists() {
                bins.push(sys_bin);
            }
        }
        bins.push(PathBuf::from("ssh-keygen"));
        bins
    }

    fn try_generate_rsa_with_ssh_keygen(
        priv_path: &Path,
        pub_path: &Path,
        comment: &str,
    ) -> Option<PrivateKey> {
        for bin in Self::resolve_ssh_keygen_binaries() {
            let _ = fs::remove_file(priv_path);
            let _ = fs::remove_file(pub_path);

            let mut cmd = Command::new(&bin);
            cmd.args(["-t", "rsa", "-b", "4096", "-N", "", "-C", comment, "-f"])
                .arg(priv_path)
                .arg("-q")
                .stdin(Stdio::null())
                .stdout(Stdio::null())
                .stderr(Stdio::null());
            #[cfg(windows)]
            cmd.creation_flags(CREATE_NO_WINDOW);

            if let Ok(status) = cmd.status() {
                if status.success() {
                    if let Ok(bytes) = fs::read(priv_path) {
                        if let Ok(parsed) = PrivateKey::from_openssh(&bytes) {
                            return Some(parsed);
                        }
                    }
                }
            }
            let _ = fs::remove_file(priv_path);
            let _ = fs::remove_file(pub_path);
        }
        None
    }

    pub fn generate_keypair(
        keys_dir: &Path,
        key_id: &str,
        key_type: &str,
        comment: Option<&str>,
        passphrase: Option<&str>,
    ) -> CoreResult<GeneratedKeyMaterial> {
        fs::create_dir_all(keys_dir)?;

        let (algorithm, normalized_type, ext) = match key_type {
            "ED25519" => (Algorithm::Ed25519, "ED25519", "id_ed25519"),
            "RSA_4096" => (Algorithm::Rsa { hash: None }, "RSA_4096", "id_rsa"),
            other => {
                return Err(CoreError::Validation(format!(
                    "Unsupported key_type: {other}"
                )));
            }
        };

        let comment_str = comment
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .unwrap_or("coreterm");

        let priv_path = keys_dir.join(format!("{key_id}.{ext}"));
        let pub_path = keys_dir.join(format!("{key_id}.{ext}.pub"));

        let mut private_key = if normalized_type == "RSA_4096" {
            Self::try_generate_rsa_with_ssh_keygen(&priv_path, &pub_path, comment_str)
        } else {
            None
        }
        .map(Ok)
        .unwrap_or_else(|| PrivateKey::random(&mut OsRng, algorithm))
        .map_err(|e| CoreError::Internal(format!("SSH key generation failed: {e}")))?;

        private_key.set_comment(comment_str);

        let mut pub_key = private_key.public_key().clone();
        pub_key.set_comment(comment_str);

        let public_key_content = pub_key
            .to_openssh()
            .map_err(|e| CoreError::Internal(format!("Public key formatting failed: {e}")))?;
        let fingerprint = pub_key.fingerprint(HashAlg::Sha256).to_string();

        let has_passphrase = passphrase.map(|p| !p.is_empty()).unwrap_or(false);
        let final_key = if let Some(pw) = passphrase.filter(|p| !p.is_empty()) {
            private_key
                .encrypt(&mut OsRng, pw.as_bytes())
                .map_err(|e| CoreError::Internal(format!("Private key encryption failed: {e}")))?
        } else {
            private_key
        };

        let openssh_pem = final_key
            .to_openssh(LineEnding::LF)
            .map_err(|e| CoreError::Internal(format!("Private key serialization failed: {e}")))?;

        fs::write(&priv_path, openssh_pem.as_bytes())?;
        fs::write(&pub_path, public_key_content.as_bytes())?;

        // Lock NTFS ACL on private key to CURRENT_USER only
        let _ = restrict_private_key_acl(&priv_path);

        Ok(GeneratedKeyMaterial {
            key_type: normalized_type.to_string(),
            private_key_path: priv_path,
            public_key_content,
            fingerprint,
            has_passphrase,
        })
    }

    pub fn inspect_key_file(path: &Path, has_passphrase_hint: bool) -> InspectedKeyMaterial {
        if let Ok(bytes) = fs::read(path) {
            if let Ok(parsed) = PrivateKey::from_openssh(&bytes) {
                let pub_key = parsed.public_key();
                let fingerprint = pub_key.fingerprint(HashAlg::Sha256).to_string();
                let public_key_content = pub_key.to_openssh().ok();
                let is_encrypted = parsed.is_encrypted() || has_passphrase_hint;
                let detected_type = match parsed.algorithm() {
                    Algorithm::Ed25519 => "ED25519",
                    Algorithm::Rsa { .. } => "RSA_4096",
                    Algorithm::Ecdsa { .. } => "ECDSA",
                    _ => "IMPORTED",
                };

                return InspectedKeyMaterial {
                    key_type: detected_type.to_string(),
                    private_key_path: path.to_path_buf(),
                    public_key_content,
                    fingerprint,
                    has_passphrase: is_encrypted,
                };
            }

            let digest = Sha256::digest(&bytes);
            let fingerprint = format!(
                "SHA256:{}",
                base64::engine::general_purpose::STANDARD_NO_PAD.encode(digest)
            );
            let pub_candidate = PathBuf::from(format!("{}.pub", path.to_string_lossy()));
            let public_key_content = fs::read_to_string(pub_candidate).ok();

            return InspectedKeyMaterial {
                key_type: "IMPORTED".to_string(),
                private_key_path: path.to_path_buf(),
                public_key_content,
                fingerprint,
                has_passphrase: has_passphrase_hint,
            };
        }

        let digest = Sha256::digest(path.to_string_lossy().as_bytes());
        let fingerprint = format!(
            "SHA256:{}",
            base64::engine::general_purpose::STANDARD_NO_PAD.encode(digest)
        );

        InspectedKeyMaterial {
            key_type: "IMPORTED".to_string(),
            private_key_path: path.to_path_buf(),
            public_key_content: None,
            fingerprint,
            has_passphrase: has_passphrase_hint,
        }
    }

    pub fn import_key_file(
        keys_dir: &Path,
        key_id: &str,
        source_path: &Path,
        copy_to_managed_dir: bool,
        has_passphrase_hint: bool,
    ) -> CoreResult<InspectedKeyMaterial> {
        let final_path = if copy_to_managed_dir && source_path.exists() {
            fs::create_dir_all(keys_dir)?;
            let dest = keys_dir.join(format!("{key_id}.imported_key"));
            fs::copy(source_path, &dest)?;
            dest
        } else {
            source_path.to_path_buf()
        };

        if final_path.exists() {
            let _ = restrict_private_key_acl(&final_path);
        }

        Ok(Self::inspect_key_file(&final_path, has_passphrase_hint))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn test_generate_rsa4096_with_passphrase_roundtrip() {
        let dir = tempdir().expect("create temp dir");
        let generated = SshKeyEngine::generate_keypair(
            dir.path(),
            "rsa-test",
            "RSA_4096",
            Some("test@coreterm"),
            Some("secret-pass"),
        )
        .expect("generate RSA-4096 key");

        assert_eq!(generated.key_type, "RSA_4096");
        assert!(generated.has_passphrase);
        assert!(generated.public_key_content.starts_with("ssh-rsa "));

        let pem = fs::read_to_string(&generated.private_key_path).expect("read private key");
        let encrypted = PrivateKey::from_openssh(&pem).expect("parse openssh key");
        assert!(encrypted.is_encrypted());
        let decrypted = encrypted
            .decrypt(b"secret-pass")
            .expect("decrypt with passphrase");
        assert_eq!(
            decrypted.public_key().fingerprint(HashAlg::Sha256).to_string(),
            generated.fingerprint
        );
    }
}

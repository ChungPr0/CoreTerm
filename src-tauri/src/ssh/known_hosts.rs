use std::process::Command;

#[cfg(windows)]
use std::os::windows::process::CommandExt;

use russh::keys::{self, known_hosts, HashAlg, PublicKey};

use crate::core::error::{CoreError, CoreResult};
#[cfg(windows)]
use crate::infra::os::CREATE_NO_WINDOW;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum HostKeyCheckOutcome {
    Trusted,
    PromptRequired {
        reason: String,
        algorithm: String,
        fingerprint: String,
    },
}

pub fn format_algorithm_name(pubkey: &PublicKey) -> String {
    let alg = pubkey.algorithm().as_str().to_uppercase();
    if alg.contains("ED25519") {
        "ED25519".to_string()
    } else if alg.contains("ECDSA") || alg.contains("NISTP") {
        "ECDSA".to_string()
    } else if alg.contains("RSA") {
        "RSA".to_string()
    } else {
        alg
    }
}

pub fn format_fingerprint_sha256(pubkey: &PublicKey) -> String {
    pubkey.fingerprint(HashAlg::Sha256).to_string()
}

/// Verifies `pubkey` against `%USERPROFILE%\.ssh\known_hosts` respecting `strict_mode` (`NO`, `ACCEPT_NEW`, `YES`).
pub fn verify_server_host_key(
    host: &str,
    port: u16,
    strict_mode: &str,
    pubkey: &PublicKey,
) -> HostKeyCheckOutcome {
    if strict_mode.eq_ignore_ascii_case("NO") {
        return HostKeyCheckOutcome::Trusted;
    }

    let trimmed = host.trim();
    let algorithm = format_algorithm_name(pubkey);
    let fingerprint = format_fingerprint_sha256(pubkey);

    match keys::check_known_hosts(trimmed, port, pubkey) {
        Ok(true) => HostKeyCheckOutcome::Trusted,
        Ok(false) => {
            if strict_mode.eq_ignore_ascii_case("ACCEPT_NEW") {
                // Match OpenSSH `StrictHostKeyChecking=accept-new`: trust and persist first-seen hosts.
                let _ = known_hosts::learn_known_hosts(trimmed, port, pubkey);
                HostKeyCheckOutcome::Trusted
            } else {
                HostKeyCheckOutcome::PromptRequired {
                    reason: "FIRST_TIME_CONNECT".to_string(),
                    algorithm,
                    fingerprint,
                }
            }
        }
        Err(keys::Error::KeyChanged { .. }) => HostKeyCheckOutcome::PromptRequired {
            reason: "HOST_KEY_CHANGED_WARNING".to_string(),
            algorithm,
            fingerprint,
        },
        Err(_) => HostKeyCheckOutcome::PromptRequired {
            reason: "FIRST_TIME_CONNECT".to_string(),
            algorithm,
            fingerprint,
        },
    }
}

pub fn record_known_host(host: &str, port: u16, pubkey: &PublicKey) -> CoreResult<()> {
    known_hosts::learn_known_hosts(host.trim(), port, pubkey)
        .map_err(|e| CoreError::Sftp(format!("Failed to record host key in known_hosts: {e}")))
}

/// Removes stale host key entries from `~/.ssh/known_hosts` via `ssh-keygen.exe -R`.
pub fn remove_host_from_known_hosts(host: &str, port: u16) {
    let trimmed = host.trim();
    if trimmed.is_empty() {
        return;
    }

    let mut cmd1 = Command::new("ssh-keygen.exe");
    cmd1.args(["-R", trimmed]);
    #[cfg(windows)]
    cmd1.creation_flags(CREATE_NO_WINDOW);
    let _ = cmd1.output();

    if port != 22 {
        let bracketed = format!("[{trimmed}]:{port}");
        let mut cmd2 = Command::new("ssh-keygen.exe");
        cmd2.args(["-R", &bracketed]);
        #[cfg(windows)]
        cmd2.creation_flags(CREATE_NO_WINDOW);
        let _ = cmd2.output();
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::tempdir;

    #[test]
    fn test_known_hosts_path_verification_states() {
        let dir = tempdir().expect("tempdir");
        let path = dir.path().join("known_hosts");
        let key_str = "AAAAC3NzaC1lZDI1NTE5AAAAIJdD7y3aLq454yWBdwLWbieU1ebz9/cu7/QEXn9OIeZJ";
        let pubkey = keys::parse_public_key_base64(key_str).expect("parse ed25519 pubkey");

        // Empty file -> not known
        fs::write(&path, "").expect("write empty known_hosts");
        assert!(!keys::check_known_hosts_path("example.com", 22, &pubkey, &path).unwrap());

        // Learn host on custom port
        known_hosts::learn_known_hosts_path("example.com", 2222, &pubkey, &path)
            .expect("learn key");
        assert!(keys::check_known_hosts_path("example.com", 2222, &pubkey, &path).unwrap());

        // Different key for same host/port -> KeyChanged
        let other_str = "AAAAC3NzaC1lZDI1NTE5AAAAIA6rWI3G1sz07DnfFlrouTcysQlj2P+jpNSOEWD9OJ3X";
        let other_key = keys::parse_public_key_base64(other_str).expect("parse other pubkey");
        let err = keys::check_known_hosts_path("example.com", 2222, &other_key, &path);
        assert!(matches!(err, Err(keys::Error::KeyChanged { .. })));
    }
}

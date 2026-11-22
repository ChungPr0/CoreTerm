use std::fs;
use std::path::{Path, PathBuf};
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

fn default_known_hosts_path() -> Option<PathBuf> {
    if let Ok(profile) = std::env::var("USERPROFILE") {
        let p = Path::new(profile.trim()).join(".ssh").join("known_hosts");
        return Some(p);
    }
    if let Ok(home) = std::env::var("HOME") {
        let p = Path::new(home.trim()).join(".ssh").join("known_hosts");
        return Some(p);
    }
    None
}

fn host_token_matches(pattern: &str, host: &str, port: u16) -> bool {
    let target_default = host.to_ascii_lowercase();
    let target_bracketed = format!("[{target_default}]:{port}");

    for token in pattern.split(',') {
        let clean = token.trim().trim_start_matches('!').to_ascii_lowercase();
        if clean.is_empty() {
            continue;
        }
        if port == 22 && (clean == target_default || clean == target_bracketed) {
            return true;
        }
        if port != 22 && clean == target_bracketed {
            return true;
        }
    }
    false
}

/// Checks whether `known_hosts` at `path` already records any key (of any algorithm) or `@revoked`
/// entry for `(host, port)`. Prevents algorithm-downgrade MITM when `russh::check_known_hosts_path`
/// returns `Ok(false)` for a different key algorithm.
pub fn has_recorded_host_entry_in_path(host: &str, port: u16, path: &Path) -> (bool, bool) {
    let Ok(raw) = fs::read_to_string(path) else {
        return (false, false);
    };
    let trimmed_host = host.trim();
    let mut has_entry = false;
    let mut is_revoked = false;

    for line in raw.lines() {
        let line = line.trim();
        if line.is_empty() || line.starts_with('#') {
            continue;
        }

        let (marker, rest) = if let Some(after_at) = line.strip_prefix('@') {
            match after_at.split_once(char::is_whitespace) {
                Some((m, r)) => (Some(m.trim()), r.trim()),
                None => continue,
            }
        } else {
            (None, line)
        };

        let mut parts = rest.split_whitespace();
        let Some(hosts_field) = parts.next() else {
            continue;
        };
        let _key_type = parts.next();
        let key_b64_opt = parts.next();

        let matched = if hosts_field.starts_with("|1|") {
            if let Some(b64) = key_b64_opt {
                if let Ok(line_key) = keys::parse_public_key_base64(b64) {
                    matches!(
                        keys::check_known_hosts_path(trimmed_host, port, &line_key, path),
                        Ok(true) | Err(keys::Error::KeyChanged { .. })
                    )
                } else {
                    false
                }
            } else {
                false
            }
        } else {
            host_token_matches(hosts_field, trimmed_host, port)
        };

        if matched {
            has_entry = true;
            if marker.is_some_and(|m| m.eq_ignore_ascii_case("revoked")) {
                is_revoked = true;
            }
        }
    }

    (has_entry, is_revoked)
}

pub fn verify_server_host_key_in_path(
    host: &str,
    port: u16,
    strict_mode: &str,
    pubkey: &PublicKey,
    known_hosts_path: Option<&Path>,
) -> HostKeyCheckOutcome {
    if strict_mode.eq_ignore_ascii_case("NO") {
        return HostKeyCheckOutcome::Trusted;
    }

    let trimmed = host.trim();
    let algorithm = format_algorithm_name(pubkey);
    let fingerprint = format_fingerprint_sha256(pubkey);

    let (has_existing_entry, is_revoked) = known_hosts_path
        .map(|p| has_recorded_host_entry_in_path(trimmed, port, p))
        .unwrap_or((false, false));

    if is_revoked {
        return HostKeyCheckOutcome::PromptRequired {
            reason: "HOST_KEY_CHANGED_WARNING".to_string(),
            algorithm,
            fingerprint,
        };
    }

    let check_res = match known_hosts_path {
        Some(p) => keys::check_known_hosts_path(trimmed, port, pubkey, p),
        None => keys::check_known_hosts(trimmed, port, pubkey),
    };

    match check_res {
        Ok(true) => HostKeyCheckOutcome::Trusted,
        Ok(false) if has_existing_entry => HostKeyCheckOutcome::PromptRequired {
            reason: "HOST_KEY_CHANGED_WARNING".to_string(),
            algorithm,
            fingerprint,
        },
        Ok(false) => {
            if strict_mode.eq_ignore_ascii_case("ACCEPT_NEW") {
                let learn_res = match known_hosts_path {
                    Some(p) => known_hosts::learn_known_hosts_path(trimmed, port, pubkey, p),
                    None => known_hosts::learn_known_hosts(trimmed, port, pubkey),
                };
                if learn_res.is_ok() {
                    HostKeyCheckOutcome::Trusted
                } else {
                    HostKeyCheckOutcome::PromptRequired {
                        reason: "FIRST_TIME_CONNECT".to_string(),
                        algorithm,
                        fingerprint,
                    }
                }
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
            reason: if has_existing_entry {
                "HOST_KEY_CHANGED_WARNING".to_string()
            } else {
                "FIRST_TIME_CONNECT".to_string()
            },
            algorithm,
            fingerprint,
        },
    }
}

/// Verifies `pubkey` against `%USERPROFILE%\.ssh\known_hosts` respecting `strict_mode` (`NO`, `ACCEPT_NEW`, `YES`).
pub fn verify_server_host_key(
    host: &str,
    port: u16,
    strict_mode: &str,
    pubkey: &PublicKey,
) -> HostKeyCheckOutcome {
    let default_path = default_known_hosts_path();
    verify_server_host_key_in_path(host, port, strict_mode, pubkey, default_path.as_deref())
}

pub fn record_known_host(host: &str, port: u16, pubkey: &PublicKey) -> CoreResult<()> {
    known_hosts::learn_known_hosts(host.trim(), port, pubkey)
        .map_err(|e| CoreError::Sftp(format!("Failed to record host key in known_hosts: {e}")))
}

fn resolve_ssh_keygen_bin() -> PathBuf {
    #[cfg(windows)]
    if let Some(windir) = std::env::var_os("WINDIR") {
        let sys_bin = Path::new(&windir)
            .join("System32")
            .join("OpenSSH")
            .join("ssh-keygen.exe");
        if sys_bin.exists() {
            return sys_bin;
        }
    }
    PathBuf::from(if cfg!(windows) {
        "ssh-keygen.exe"
    } else {
        "ssh-keygen"
    })
}

/// Removes stale host key entries from `~/.ssh/known_hosts` via `ssh-keygen.exe -R`.
pub fn remove_host_from_known_hosts(host: &str, port: u16) {
    let trimmed = host.trim();
    if trimmed.is_empty() || trimmed.starts_with('-') {
        return;
    }

    let ssh_keygen_bin = resolve_ssh_keygen_bin();

    let mut cmd1 = Command::new(&ssh_keygen_bin);
    cmd1.args(["-R", trimmed]);
    #[cfg(windows)]
    cmd1.creation_flags(CREATE_NO_WINDOW);
    let _ = cmd1.output();

    if port != 22 {
        let bracketed = format!("[{trimmed}]:{port}");
        let mut cmd2 = Command::new(&ssh_keygen_bin);
        cmd2.args(["-R", &bracketed]);
        #[cfg(windows)]
        cmd2.creation_flags(CREATE_NO_WINDOW);
        let _ = cmd2.output();
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn test_known_hosts_path_verification_states_and_algo_switch_mitm_block() {
        let dir = tempdir().expect("tempdir");
        let path = dir.path().join("known_hosts");
        let key_str = "AAAAC3NzaC1lZDI1NTE5AAAAIJdD7y3aLq454yWBdwLWbieU1ebz9/cu7/QEXn9OIeZJ";
        let ed_pubkey = keys::parse_public_key_base64(key_str).expect("parse ed25519 pubkey");

        // Empty file -> not known -> ACCEPT_NEW learns and trusts it
        fs::write(&path, "").expect("write empty known_hosts");
        let first = verify_server_host_key_in_path(
            "example.com",
            2222,
            "ACCEPT_NEW",
            &ed_pubkey,
            Some(&path),
        );
        assert_eq!(first, HostKeyCheckOutcome::Trusted);

        // Same key -> Trusted
        let second = verify_server_host_key_in_path(
            "example.com",
            2222,
            "ACCEPT_NEW",
            &ed_pubkey,
            Some(&path),
        );
        assert_eq!(second, HostKeyCheckOutcome::Trusted);

        // Different Ed25519 key -> HOST_KEY_CHANGED_WARNING
        let other_ed_str = "AAAAC3NzaC1lZDI1NTE5AAAAIA6rWI3G1sz07DnfFlrouTcysQlj2P+jpNSOEWD9OJ3X";
        let other_ed = keys::parse_public_key_base64(other_ed_str).expect("parse other ed25519");
        let changed_same_alg = verify_server_host_key_in_path(
            "example.com",
            2222,
            "ACCEPT_NEW",
            &other_ed,
            Some(&path),
        );
        assert!(matches!(
            changed_same_alg,
            HostKeyCheckOutcome::PromptRequired { ref reason, .. } if reason == "HOST_KEY_CHANGED_WARNING"
        ));

        // Different algorithm (RSA) for already-pinned Ed25519 host -> MUST ALSO trigger HOST_KEY_CHANGED_WARNING under ACCEPT_NEW!
        let mut rsa_wire = Vec::new();
        rsa_wire.extend_from_slice(&7u32.to_be_bytes());
        rsa_wire.extend_from_slice(b"ssh-rsa");
        rsa_wire.extend_from_slice(&3u32.to_be_bytes());
        rsa_wire.extend_from_slice(&[0x01, 0x00, 0x01]);
        let mut modulus = vec![0u8; 257];
        modulus[1] = 0xc7;
        modulus[256] = 0x01;
        rsa_wire.extend_from_slice(&(modulus.len() as u32).to_be_bytes());
        rsa_wire.extend_from_slice(&modulus);
        let rsa_b64 = base64::Engine::encode(&base64::engine::general_purpose::STANDARD, &rsa_wire);
        let rsa_pub = keys::parse_public_key_base64(&rsa_b64).expect("parse rsa pubkey");
        let changed_diff_alg = verify_server_host_key_in_path(
            "EXAMPLE.COM",
            2222,
            "ACCEPT_NEW",
            &rsa_pub,
            Some(&path),
        );
        assert!(matches!(
            changed_diff_alg,
            HostKeyCheckOutcome::PromptRequired { ref reason, .. } if reason == "HOST_KEY_CHANGED_WARNING"
        ));
    }
}

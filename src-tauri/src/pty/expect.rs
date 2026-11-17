#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ExpectPhase {
    Handshaking,
    Passthrough,
}

#[derive(Debug, Clone)]
pub enum ExpectSignal {
    None,
    PasswordPrompt {
        prompt_text: String,
        attempt: u8,
    },
    PassphrasePrompt {
        prompt_text: String,
        attempt: u8,
    },
    HostKeyPrompt {
        algorithm: String,
        fingerprint: String,
        reason: String,
    },
    AuthFailed {
        reason: String,
    },
    ConnectFailed {
        reason: String,
    },
    Connected,
}

fn strip_ansi(raw: &str) -> String {
    let bytes = raw.as_bytes();
    let mut out = String::with_capacity(raw.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == 0x1B {
            i += 1;
            if i >= bytes.len() {
                break;
            }
            if bytes[i] == b'[' {
                i += 1;
                while i < bytes.len() && !(0x40..=0x7E).contains(&bytes[i]) {
                    i += 1;
                }
                if i < bytes.len() {
                    // Preserve line separation on ConPTY cursor-position / next-line sequences.
                    if matches!(bytes[i], b'H' | b'f' | b'E' | b'G') && !out.ends_with('\n') {
                        out.push('\n');
                    }
                    i += 1;
                }
            } else if bytes[i] == b']' {
                i += 1;
                while i < bytes.len() {
                    if bytes[i] == 0x07 {
                        i += 1;
                        break;
                    }
                    if bytes[i] == 0x1B && i + 1 < bytes.len() && bytes[i + 1] == b'\\' {
                        i += 2;
                        break;
                    }
                    i += 1;
                }
            } else {
                i += 1;
            }
            continue;
        }
        if bytes[i] == b'\r' {
            if !out.ends_with('\n') {
                out.push('\n');
            }
            i += 1;
            if i < bytes.len() && bytes[i] == b'\n' {
                i += 1;
            }
            continue;
        }
        let ch = raw[i..].chars().next().unwrap_or('\0');
        out.push(ch);
        i += ch.len_utf8();
    }
    out
}

/// Inspects raw ConPTY output during SSH handshake to detect password, passphrase, or host key prompts.
pub struct ExpectStateMachine {
    phase: ExpectPhase,
    rolling_buf: String,
    password_attempts: u8,
    passphrase_attempts: u8,
    host_key_prompted: bool,
    host_key_changed_detected: bool,
}

impl Default for ExpectStateMachine {
    fn default() -> Self {
        Self::new()
    }
}

impl ExpectStateMachine {
    pub fn new() -> Self {
        Self {
            phase: ExpectPhase::Handshaking,
            rolling_buf: String::with_capacity(512),
            password_attempts: 0,
            passphrase_attempts: 0,
            host_key_prompted: false,
            host_key_changed_detected: false,
        }
    }

    pub fn phase(&self) -> &ExpectPhase {
        &self.phase
    }

    pub fn set_passthrough(&mut self) {
        self.phase = ExpectPhase::Passthrough;
        self.rolling_buf.clear();
    }

    pub fn feed(&mut self, chunk: &[u8]) -> ExpectSignal {
        if self.phase == ExpectPhase::Passthrough {
            return ExpectSignal::None;
        }

        let text = String::from_utf8_lossy(chunk);
        self.rolling_buf.push_str(&text);
        if self.rolling_buf.len() > 1536 {
            let drain_len = self.rolling_buf.len() - 768;
            let valid_idx = self
                .rolling_buf
                .char_indices()
                .map(|(i, _)| i)
                .find(|&i| i >= drain_len)
                .unwrap_or(0);
            self.rolling_buf.drain(..valid_idx);
        }

        let clean = strip_ansi(&self.rolling_buf);
        let lower = clean.to_lowercase();

        if !self.host_key_changed_detected
            && lower.contains("remote host identification has changed")
            && (lower.contains("host key verification failed") || lower.contains("sha256:"))
        {
            self.host_key_changed_detected = true;
            let (alg, fp) = Self::extract_algo_and_fingerprint(&clean);
            self.rolling_buf.clear();
            return ExpectSignal::HostKeyPrompt {
                algorithm: alg,
                fingerprint: fp,
                reason: "HOST_KEY_CHANGED_WARNING".to_string(),
            };
        }

        if !self.host_key_prompted && lower.contains("continue connecting (yes/no") {
            self.host_key_prompted = true;
            let (alg, fp) = Self::extract_algo_and_fingerprint(&clean);
            self.rolling_buf.clear();
            return ExpectSignal::HostKeyPrompt {
                algorithm: alg,
                fingerprint: fp,
                reason: "FIRST_TIME_CONNECT".to_string(),
            };
        }

        if lower.contains("permission denied (")
            || lower.contains("too many authentication failures")
            || lower.contains("no more authentication methods to try")
        {
            let reason = Self::extract_last_line(&clean);
            self.rolling_buf.clear();
            return ExpectSignal::AuthFailed { reason };
        }

        if lower.contains("enter passphrase for key") {
            let trimmed = lower.trim_end();
            if trimmed.ends_with(':') {
                self.passphrase_attempts = self.passphrase_attempts.saturating_add(1);
                let prompt_text = Self::extract_last_line(&clean);
                self.rolling_buf.clear();
                return ExpectSignal::PassphrasePrompt {
                    prompt_text,
                    attempt: self.passphrase_attempts,
                };
            }
        }

        if lower.contains("password:") {
            let trimmed = lower.trim_end();
            if trimmed.ends_with("password:") {
                self.password_attempts = self.password_attempts.saturating_add(1);
                let prompt_text = Self::extract_last_line(&clean);
                self.rolling_buf.clear();
                return ExpectSignal::PasswordPrompt {
                    prompt_text,
                    attempt: self.password_attempts,
                };
            }
        }

        if let Some(reason) = Self::extract_connect_error(&clean, &lower) {
            self.rolling_buf.clear();
            return ExpectSignal::ConnectFailed { reason };
        }

        if Self::looks_like_shell_connected(&text, &clean, &lower) {
            self.set_passthrough();
            return ExpectSignal::Connected;
        }

        ExpectSignal::None
    }

    fn extract_connect_error(clean: &str, lower: &str) -> Option<String> {
        const PATTERNS: &[&str] = &[
            "connection timed out",
            "connection refused",
            "could not resolve hostname",
            "no route to host",
            "network is unreachable",
            "connection reset by peer",
            "connection closed by remote host",
            "kex_exchange_identification:",
            "no matching host key type",
            "no matching cipher",
            "no matching key exchange",
        ];
        if !PATTERNS.iter().any(|pat| lower.contains(pat)) {
            return None;
        }
        let matched_line = clean
            .lines()
            .rev()
            .map(str::trim)
            .find(|line| {
                let l = line.to_lowercase();
                PATTERNS.iter().any(|pat| l.contains(pat))
            })
            .unwrap_or("")
            .to_string();
        if matched_line.is_empty() {
            Some(Self::extract_last_line(clean))
        } else {
            Some(matched_line)
        }
    }

    fn looks_like_shell_connected(raw: &str, clean: &str, lower: &str) -> bool {
        if raw.contains("\x1b[?2004h")
            || lower.contains("last login:")
            || lower.contains("welcome to ")
            || lower.contains("microsoft windows [")
            || lower.contains("windows powershell")
            || lower.contains("(c) microsoft corporation")
            || lower.contains("have a lot of fun")
        {
            return true;
        }

        clean.lines().any(|line| {
            let no_eol = line.trim_end_matches(['\r', '\n']);
            let trimmed = no_eol.trim_end();
            no_eol.ends_with("$ ")
                || no_eol.ends_with("# ")
                || no_eol.ends_with("% ")
                || no_eol.ends_with("❯ ")
                || trimmed.ends_with('$')
                || trimmed.ends_with('#')
                || trimmed.ends_with('❯')
                || (trimmed.ends_with('>')
                    && trimmed.contains(":\\")
                    && !trimmed.to_lowercase().contains("key"))
        })
    }

    fn extract_last_line(buf: &str) -> String {
        buf.lines()
            .rev()
            .find(|l| !l.trim().is_empty())
            .unwrap_or("")
            .trim()
            .to_string()
    }

    fn extract_algo_and_fingerprint(buf: &str) -> (String, String) {
        let upper = buf.to_uppercase();
        let algo = if upper.contains("ED25519") {
            "ED25519"
        } else if upper.contains("ECDSA") {
            "ECDSA"
        } else if upper.contains("RSA") {
            "RSA"
        } else {
            "SSH"
        };

        let mut fp = "SHA256:unknown".to_string();
        for word in buf.split_whitespace() {
            if word.starts_with("SHA256:") {
                fp = word.trim_end_matches('.').to_string();
                break;
            }
        }
        (algo.to_string(), fp)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn detects_password_and_passphrase_through_conpty_vt_sequences() {
        let mut sm = ExpectStateMachine::new();
        let sig = sm.feed(b"\x1b[?25l\x1b[2;1Hroot@10.0.0.1's password: \x1b[?25h");
        match sig {
            ExpectSignal::PasswordPrompt { prompt_text, attempt } => {
                assert_eq!(prompt_text, "root@10.0.0.1's password:");
                assert_eq!(attempt, 1);
            }
            other => panic!("expected PasswordPrompt, got {other:?}"),
        }

        let sig2 = sm.feed(b"\x1b]0;ssh.exe\x07Enter passphrase for key '/id_ed25519'");
        assert!(matches!(sig2, ExpectSignal::None));
        let sig3 = sm.feed(b": \x1b[?25h");
        assert!(matches!(sig3, ExpectSignal::PassphrasePrompt { attempt: 1, .. }));

        let sig4 = sm.feed(b"Permission denied, please try again.\r\nroot@10.0.0.1's password: ");
        assert!(matches!(sig4, ExpectSignal::PasswordPrompt { attempt: 2, .. }));

        let sig5 = sm.feed(b"Too many authentication failures\r\n");
        assert!(matches!(sig5, ExpectSignal::AuthFailed { .. }));
    }

    #[test]
    fn detects_host_key_auth_failed_and_passthrough() {
        let mut sm = ExpectStateMachine::new();
        let hk = sm.feed(
            b"ED25519 key fingerprint is SHA256:abc123.\r\nAre you sure you want to continue connecting (yes/no/[fingerprint])? ",
        );
        match hk {
            ExpectSignal::HostKeyPrompt {
                algorithm,
                fingerprint,
                reason,
            } => {
                assert_eq!(algorithm, "ED25519");
                assert_eq!(fingerprint, "SHA256:abc123");
                assert_eq!(reason, "FIRST_TIME_CONNECT");
            }
            other => panic!("expected HostKeyPrompt, got {other:?}"),
        }

        let denied = sm.feed(b"\x1b[31mPermission denied (publickey,password).\x1b[m\r\n");
        assert!(matches!(denied, ExpectSignal::AuthFailed { .. }));

        let conn_sig = sm.feed(b"Last login: Mon Nov 16 12:00:00 2026\r\n");
        assert!(matches!(conn_sig, ExpectSignal::Connected));
        assert_eq!(sm.phase(), &ExpectPhase::Passthrough);
    }

    #[test]
    fn detects_ssh_connect_timeout_and_windows_shell_connected() {
        let mut sm_err = ExpectStateMachine::new();
        let err_sig = sm_err.feed(b"ssh: connect to host 192.168.88.152 port 22: Connection timed out\r\n");
        match err_sig {
            ExpectSignal::ConnectFailed { reason } => {
                assert_eq!(
                    reason,
                    "ssh: connect to host 192.168.88.152 port 22: Connection timed out"
                );
            }
            other => panic!("expected ConnectFailed, got {other:?}"),
        }
        assert_eq!(sm_err.phase(), &ExpectPhase::Handshaking);

        let mut sm_win = ExpectStateMachine::new();
        let win_sig = sm_win.feed(b"tienc@CHUNG C:\\Users\\tienc>");
        assert!(matches!(win_sig, ExpectSignal::Connected));
        assert_eq!(sm_win.phase(), &ExpectPhase::Passthrough);
    }
}

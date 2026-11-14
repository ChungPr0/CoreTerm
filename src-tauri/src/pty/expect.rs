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

        let lower = self.rolling_buf.to_lowercase();

        if !self.host_key_changed_detected
            && lower.contains("remote host identification has changed")
            && (lower.contains("host key verification failed") || lower.contains("sha256:"))
        {
            self.host_key_changed_detected = true;
            let (alg, fp) = Self::extract_algo_and_fingerprint(&self.rolling_buf);
            self.rolling_buf.clear();
            return ExpectSignal::HostKeyPrompt {
                algorithm: alg,
                fingerprint: fp,
                reason: "HOST_KEY_CHANGED_WARNING".to_string(),
            };
        }

        if !self.host_key_prompted && lower.contains("continue connecting (yes/no") {
            self.host_key_prompted = true;
            let (alg, fp) = Self::extract_algo_and_fingerprint(&self.rolling_buf);
            self.rolling_buf.clear();
            return ExpectSignal::HostKeyPrompt {
                algorithm: alg,
                fingerprint: fp,
                reason: "FIRST_TIME_CONNECT".to_string(),
            };
        }

        if lower.contains("permission denied (") {
            let reason = self.extract_last_line();
            self.rolling_buf.clear();
            return ExpectSignal::AuthFailed { reason };
        }

        if lower.contains("enter passphrase for key") {
            let trimmed = lower.trim_end();
            if trimmed.ends_with(':') {
                self.passphrase_attempts = self.passphrase_attempts.saturating_add(1);
                let prompt_text = self.extract_last_line();
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
                let prompt_text = self.extract_last_line();
                self.rolling_buf.clear();
                return ExpectSignal::PasswordPrompt {
                    prompt_text,
                    attempt: self.password_attempts,
                };
            }
        }

        if lower.contains("last login:")
            || lower.contains("welcome to ")
            || self.rolling_buf.ends_with("$ ")
            || self.rolling_buf.ends_with("# ")
        {
            self.set_passthrough();
        }

        ExpectSignal::None
    }

    fn extract_last_line(&self) -> String {
        self.rolling_buf
            .lines()
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

use thiserror::Error;

#[derive(Debug, Error)]
pub enum CoreError {
    #[error("{0}")]
    Database(#[from] rusqlite::Error),

    #[error("{0}")]
    Validation(String),

    #[error("{0}")]
    NotFound(String),

    #[error("{0}")]
    Pty(String),

    #[error("{0}")]
    Sftp(String),

    #[error("{0}")]
    Os(String),

    #[error("{0}")]
    Io(#[from] std::io::Error),

    #[error("{0}")]
    Internal(String),
}

impl CoreError {
    pub fn code(&self) -> &'static str {
        match self {
            CoreError::Database(_) => "DATABASE_ERROR",
            CoreError::Validation(_) => "VALIDATION_ERROR",
            CoreError::NotFound(_) => "NOT_FOUND",
            CoreError::Pty(_) => "PTY_ERROR",
            CoreError::Sftp(_) => "SFTP_ERROR",
            CoreError::Os(_) => "OS_ERROR",
            CoreError::Io(_) => "IO_ERROR",
            CoreError::Internal(_) => "INTERNAL_ERROR",
        }
    }
}

pub type CoreResult<T> = Result<T, CoreError>;

/// Drops adjacent duplicate `: `-separated segments (e.g. "Permission denied: Permission denied").
pub fn dedupe_error_text(raw: &str) -> String {
    let mut parts: Vec<&str> = Vec::new();
    for seg in raw.split(": ") {
        let trimmed = seg.trim();
        if trimmed.is_empty() {
            continue;
        }
        if parts
            .last()
            .is_some_and(|prev| prev.eq_ignore_ascii_case(trimmed))
        {
            continue;
        }
        parts.push(trimmed);
    }
    parts.join(": ")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn dedupes_repeated_error_segments() {
        assert_eq!(
            dedupe_error_text("Failed to update permissions: Permission denied: Permission denied"),
            "Failed to update permissions: Permission denied"
        );
        assert_eq!(
            dedupe_error_text("Timeout: Timeout"),
            "Timeout"
        );
    }
}

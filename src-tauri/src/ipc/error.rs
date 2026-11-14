use serde::Serialize;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum AppError {
    #[error("Database error: {0}")]
    Database(#[from] rusqlite::Error),

    #[error("Validation error: {0}")]
    Validation(String),

    #[error("Resource not found: {0}")]
    NotFound(String),

    #[error("PTY error: {0}")]
    Pty(String),

    #[error("OS/Process error: {0}")]
    Os(String),

    #[error("I/O error: {0}")]
    Io(#[from] std::io::Error),

    #[error("Internal error: {0}")]
    Internal(String),
}

#[derive(Debug, Clone, Serialize)]
pub struct AppErrorDto {
    pub code: String,
    pub message: String,
}

impl AppError {
    pub fn code(&self) -> &'static str {
        match self {
            AppError::Database(_) => "DATABASE_ERROR",
            AppError::Validation(_) => "VALIDATION_ERROR",
            AppError::NotFound(_) => "NOT_FOUND",
            AppError::Pty(_) => "PTY_ERROR",
            AppError::Os(_) => "OS_ERROR",
            AppError::Io(_) => "IO_ERROR",
            AppError::Internal(_) => "INTERNAL_ERROR",
        }
    }

    pub fn to_dto(&self) -> AppErrorDto {
        AppErrorDto {
            code: self.code().to_string(),
            message: self.to_string(),
        }
    }
}

impl Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        self.to_dto().serialize(serializer)
    }
}

pub type AppResult<T> = Result<T, AppError>;

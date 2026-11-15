use serde::Serialize;

use crate::core::error::{dedupe_error_text, CoreError, CoreResult};

pub type AppError = CoreError;
pub type AppResult<T> = CoreResult<T>;

#[derive(Debug, Clone, Serialize)]
pub struct AppErrorDto {
    pub code: String,
    pub message: String,
}

pub fn to_error_dto(err: &CoreError) -> AppErrorDto {
    AppErrorDto {
        code: err.code().to_string(),
        message: dedupe_error_text(&err.to_string()),
    }
}

impl Serialize for CoreError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        to_error_dto(self).serialize(serializer)
    }
}

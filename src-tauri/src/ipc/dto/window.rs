use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppStatusDto {
    pub is_elevated: bool,
    pub has_native_border: bool,
}

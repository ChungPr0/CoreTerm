use std::ffi::OsString;

use crate::core::error::{CoreError, CoreResult};
use crate::ipc::dto::HostFullConfigDto;

pub fn validate_host_target(config: &HostFullConfigDto) -> CoreResult<(&str, &str)> {
    let host = config.host.trim();
    let user = config.username.trim();
    if host.is_empty() {
        return Err(CoreError::Validation("Host cannot be empty".to_string()));
    }
    if host.starts_with('-') {
        return Err(CoreError::Validation(format!(
            "Host cannot start with a hyphen '-': '{host}'"
        )));
    }
    if host.chars().any(|c| c.is_whitespace() || c.is_control()) {
        return Err(CoreError::Validation(format!(
            "Host contains invalid whitespace or control characters: '{host}'"
        )));
    }

    if user.is_empty() {
        return Err(CoreError::Validation("Username cannot be empty".to_string()));
    }
    if user.starts_with('-') {
        return Err(CoreError::Validation(format!(
            "Username cannot start with a hyphen '-': '{user}'"
        )));
    }
    if user.chars().any(|c| c.is_whitespace() || c.is_control()) {
        return Err(CoreError::Validation(format!(
            "Username contains invalid whitespace or control characters: '{user}'"
        )));
    }
    Ok((host, user))
}

pub fn strict_host_key_value(mode: &str) -> &'static str {
    match mode {
        "YES" => "yes",
        "NO" => "no",
        _ => "accept-new",
    }
}

pub fn push_base_target_args(args: &mut Vec<OsString>, config: &HostFullConfigDto) {
    args.push(OsString::from("-p"));
    args.push(OsString::from(config.port.to_string()));
    args.push(OsString::from("-l"));
    args.push(OsString::from(config.username.trim()));
}

pub fn push_key_identity_args(args: &mut Vec<OsString>, key_path: &str) {
    args.push(OsString::from("-i"));
    args.push(OsString::from(key_path.trim()));
    args.push(OsString::from("-o"));
    args.push(OsString::from("IdentitiesOnly=yes"));
}

pub fn push_strict_host_key_arg(args: &mut Vec<OsString>, mode: &str) {
    args.push(OsString::from("-o"));
    args.push(OsString::from(format!(
        "StrictHostKeyChecking={}",
        strict_host_key_value(mode)
    )));
}

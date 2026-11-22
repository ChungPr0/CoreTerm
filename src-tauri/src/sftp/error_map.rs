use russh_sftp::client::error::Error as SftpClientError;

use crate::core::error::CoreError;

pub fn map_russh_error(prefix: &str, err: russh::Error) -> CoreError {
    let err_str = err.to_string();
    let err_trimmed = err_str.trim();
    if err_trimmed.is_empty() {
        CoreError::Sftp(prefix.to_string())
    } else {
        CoreError::Sftp(err_trimmed.to_string())
    }
}

pub fn fmt_sftp_err(err: &SftpClientError) -> String {
    match err {
        SftpClientError::Status(st) => {
            let code = st.status_code.to_string();
            let code_trimmed = code.trim();
            let msg = st.error_message.trim();
            if msg.is_empty() || msg.eq_ignore_ascii_case(code_trimmed) {
                code_trimmed.to_string()
            } else if msg
                .to_ascii_lowercase()
                .starts_with(&code_trimmed.to_ascii_lowercase())
                || code_trimmed.eq_ignore_ascii_case("Failure")
            {
                msg.to_string()
            } else {
                format!("{code_trimmed}: {msg}")
            }
        }
        other => other.to_string(),
    }
}

pub fn map_sftp_error(prefix: &str, err: SftpClientError) -> CoreError {
    CoreError::Sftp(format!("{prefix}: {}", fmt_sftp_err(&err)))
}

#[cfg(test)]
mod tests {
    use super::*;
    use russh_sftp::protocol::{Status, StatusCode};

    #[test]
    fn fmt_sftp_err_dedupes_status_message() {
        let dup = SftpClientError::Status(Status {
            id: 1,
            status_code: StatusCode::PermissionDenied,
            error_message: "Permission denied".into(),
            language_tag: "en".into(),
        });
        assert_eq!(fmt_sftp_err(&dup), "Permission denied");

        let empty_msg = SftpClientError::Status(Status {
            id: 2,
            status_code: StatusCode::NoSuchFile,
            error_message: "".into(),
            language_tag: "en".into(),
        });
        assert_eq!(fmt_sftp_err(&empty_msg), "No such file");

        let failure_detail = SftpClientError::Status(Status {
            id: 3,
            status_code: StatusCode::Failure,
            error_message: "Disk quota exceeded".into(),
            language_tag: "en".into(),
        });
        assert_eq!(fmt_sftp_err(&failure_detail), "Disk quota exceeded");
    }
}

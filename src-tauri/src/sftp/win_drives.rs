use std::collections::BTreeSet;
use std::sync::Arc;
use std::time::Duration;

use russh_sftp::client::SftpSession;

use crate::core::defaults::SFTP_DRIVE_PROBE_TIMEOUT_SECS;
use crate::ipc::dto::LocalDriveDto;

pub(super) fn extract_win_drive_letter(path: &str) -> Option<char> {
    let trimmed = path.trim().trim_start_matches(['/', '\\']);
    let bytes = trimmed.as_bytes();
    if bytes.len() >= 2
        && bytes[0].is_ascii_alphabetic()
        && bytes[1] == b':'
        && (bytes.len() == 2 || bytes[2] == b'/' || bytes[2] == b'\\')
    {
        return Some((bytes[0] as char).to_ascii_uppercase());
    }
    None
}

pub(super) async fn discover_remote_windows_drives(
    sftp: &Arc<SftpSession>,
    home_path: &str,
) -> Vec<LocalDriveDto> {
    let home_drive = extract_win_drive_letter(home_path);
    if home_drive.is_none() && home_path != "/" {
        return Vec::new();
    }

    let probe_timeout = Duration::from_secs(SFTP_DRIVE_PROBE_TIMEOUT_SECS);
    let mut found = BTreeSet::new();
    if let Ok(Ok(entries)) = tokio::time::timeout(probe_timeout, sftp.read_dir("/")).await {
        for item in entries {
            if let Some(letter) = extract_win_drive_letter(&item.file_name()) {
                found.insert(letter);
            }
        }
    }

    let Some(home_letter) = home_drive else {
        return found
            .into_iter()
            .map(|ch| LocalDriveDto {
                name: format!("{ch}:"),
                path: format!("/{ch}:/"),
            })
            .collect();
    };

    found.insert(home_letter);
    if found.len() <= 1 {
        let sem = Arc::new(tokio::sync::Semaphore::new(12));
        let mut set = tokio::task::JoinSet::new();
        for ch in 'C'..='Z' {
            if ch == home_letter {
                continue;
            }
            let sftp = Arc::clone(sftp);
            let sem = Arc::clone(&sem);
            set.spawn(async move {
                let _permit = sem.acquire().await.ok();
                let root = format!("/{ch}:/");
                let ok = matches!(
                    tokio::time::timeout(probe_timeout, sftp.metadata(&root)).await,
                    Ok(Ok(_))
                );
                ok.then_some(ch)
            });
        }
        while let Some(res) = set.join_next().await {
            if let Ok(Some(ch)) = res {
                found.insert(ch);
            }
        }
    }

    found
        .into_iter()
        .map(|ch| LocalDriveDto {
            name: format!("{ch}:"),
            path: format!("/{ch}:/"),
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extract_win_drive_letter_parses_windows_and_rejects_posix() {
        assert_eq!(extract_win_drive_letter("/C:/Users/tienc"), Some('C'));
        assert_eq!(extract_win_drive_letter("d:\\"), Some('D'));
        assert_eq!(extract_win_drive_letter("E:"), Some('E'));
        assert_eq!(extract_win_drive_letter("/home/user"), None);
        assert_eq!(extract_win_drive_letter("etc"), None);
        assert_eq!(extract_win_drive_letter("c:relative"), None);
    }
}

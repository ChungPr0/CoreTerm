use std::collections::HashSet;
use std::process::Stdio;
use std::time::Duration;

use crate::core::defaults::WSL_LIST_TIMEOUT_MS;
#[cfg(windows)]
use crate::infra::os::CREATE_NO_WINDOW;

const WSL_LIST_TIMEOUT: Duration = Duration::from_millis(WSL_LIST_TIMEOUT_MS);

fn decode_utf16_le(bytes: &[u8]) -> String {
    let words: Vec<u16> = bytes
        .as_chunks::<2>()
        .0
        .iter()
        .map(|&c| u16::from_le_bytes(c))
        .collect();
    String::from_utf16_lossy(&words)
}

fn decode_wsl_output(bytes: &[u8]) -> String {
    if bytes.starts_with(&[0xFF, 0xFE]) {
        return decode_utf16_le(&bytes[2..]);
    }
    // Older Windows 10 wsl.exe emits UTF-16LE without BOM.
    if bytes.len() >= 2 && bytes.len().is_multiple_of(2) && bytes.contains(&0) {
        return decode_utf16_le(bytes);
    }
    String::from_utf8_lossy(bytes).into_owned()
}

pub(crate) fn parse_wsl_distro_list(bytes: &[u8]) -> Vec<String> {
    let decoded = decode_wsl_output(bytes);
    let mut seen = HashSet::new();
    let mut distros = Vec::new();

    for raw in decoded.lines() {
        let name = raw.trim().trim_matches('\0').trim();
        if name.is_empty() || name.starts_with('-') {
            continue;
        }
        // Skip Docker Desktop internal WSL containers (not interactive user shells).
        if name.eq_ignore_ascii_case("docker-desktop")
            || name.eq_ignore_ascii_case("docker-desktop-data")
        {
            continue;
        }
        if seen.insert(name.to_string()) {
            distros.push(name.to_string());
        }
    }
    distros
}

pub(super) async fn detect_wsl_distros(wsl_exe: &str) -> Vec<String> {
    let mut cmd = tokio::process::Command::new(wsl_exe);
    cmd.args(["-l", "-q"])
        .env("WSL_UTF8", "1")
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true);

    #[cfg(windows)]
    cmd.creation_flags(CREATE_NO_WINDOW);

    let Ok(Ok(output)) = tokio::time::timeout(WSL_LIST_TIMEOUT, cmd.output()).await else {
        return Vec::new();
    };
    if !output.status.success() {
        return Vec::new();
    }
    parse_wsl_distro_list(&output.stdout)
}

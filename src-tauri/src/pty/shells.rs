use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::time::Duration;

#[cfg(windows)]
use crate::infra::os::CREATE_NO_WINDOW;
use crate::ipc::dto::ShellProfile;

const WSL_LIST_TIMEOUT: Duration = Duration::from_millis(1500);

fn is_usable_file(path: &Path) -> bool {
    path.is_file()
}

fn find_in_path(exe_name: &str) -> Option<PathBuf> {
    let path_var = std::env::var_os("PATH")?;
    for dir in std::env::split_paths(&path_var) {
        let candidate = dir.join(exe_name);
        if is_usable_file(&candidate) {
            return Some(candidate);
        }
    }
    None
}

fn find_executable(exe_name: &str, fallbacks: &[PathBuf]) -> Option<String> {
    if let Some(p) = find_in_path(exe_name) {
        return Some(p.to_string_lossy().into_owned());
    }
    for candidate in fallbacks {
        if is_usable_file(candidate) {
            return Some(candidate.to_string_lossy().into_owned());
        }
    }
    None
}

fn env_path(var: &str, suffix: &str) -> Option<PathBuf> {
    std::env::var_os(var)
        .filter(|v| !v.is_empty())
        .map(|v| PathBuf::from(v).join(suffix))
}

fn git_bash_from_git_exe(git_exe: &Path) -> Option<PathBuf> {
    // Derive Git root from ...\Git\cmd\git.exe or ...\Git\mingw64\bin\git.exe.
    let mut cur = git_exe.parent()?;
    for _ in 0..3 {
        for rel in ["bin\\bash.exe", "usr\\bin\\bash.exe"] {
            let candidate = cur.join(rel);
            if is_usable_file(&candidate) {
                return Some(candidate);
            }
        }
        cur = cur.parent()?;
    }
    None
}

fn find_git_bash() -> Option<String> {
    let candidates = [
        env_path("ProgramFiles", r"Git\bin\bash.exe"),
        env_path("ProgramFiles", r"Git\usr\bin\bash.exe"),
        env_path("ProgramFiles(x86)", r"Git\bin\bash.exe"),
        env_path("ProgramFiles(x86)", r"Git\usr\bin\bash.exe"),
        env_path("LOCALAPPDATA", r"Programs\Git\bin\bash.exe"),
        env_path("LOCALAPPDATA", r"Programs\Git\usr\bin\bash.exe"),
        env_path("USERPROFILE", r"scoop\apps\git\current\bin\bash.exe"),
    ];
    for candidate in candidates.into_iter().flatten() {
        if is_usable_file(&candidate) {
            return Some(candidate.to_string_lossy().into_owned());
        }
    }
    if let Some(git_exe) = find_in_path("git.exe") {
        if let Some(bash) = git_bash_from_git_exe(&git_exe) {
            return Some(bash.to_string_lossy().into_owned());
        }
    }
    None
}

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
        if name.is_empty() {
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

async fn detect_wsl_distros(wsl_exe: &str) -> Vec<String> {
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

pub fn default_shell_profile() -> ShellProfile {
    #[cfg(windows)]
    let executable = find_executable(
        "powershell.exe",
        &env_path("SystemRoot", r"System32\WindowsPowerShell\v1.0\powershell.exe")
            .into_iter()
            .collect::<Vec<_>>(),
    )
    .unwrap_or_else(|| "powershell.exe".to_string());

    #[cfg(not(windows))]
    let executable = std::env::var("SHELL").unwrap_or_else(|_| "/bin/sh".to_string());

    ShellProfile {
        id: "powershell".to_string(),
        kind: "powershell".to_string(),
        name: "PowerShell".to_string(),
        executable,
        args: if cfg!(windows) {
            vec!["-NoLogo".to_string()]
        } else {
            Vec::new()
        },
    }
}

pub(crate) fn is_default_powershell(profile: &ShellProfile) -> bool {
    if profile.id == "powershell" {
        return true;
    }
    let exe_name = Path::new(&profile.executable)
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or("");
    exe_name.eq_ignore_ascii_case("powershell.exe")
        && (profile.args.is_empty()
            || (profile.args.len() == 1 && profile.args[0].eq_ignore_ascii_case("-NoLogo")))
}

/// Scans the host for supported local shells (`powershell.exe`, `pwsh.exe`, `cmd.exe`, Git Bash, and WSL distros).
pub async fn detect_available_shells() -> Vec<ShellProfile> {
    #[cfg(windows)]
    {
        let mut profiles = Vec::new();

        let ps_fallbacks: Vec<PathBuf> =
            env_path("SystemRoot", r"System32\WindowsPowerShell\v1.0\powershell.exe")
                .into_iter()
                .collect();
        if let Some(exe) = find_executable("powershell.exe", &ps_fallbacks) {
            profiles.push(ShellProfile {
                id: "powershell".to_string(),
                kind: "powershell".to_string(),
                name: "PowerShell".to_string(),
                executable: exe,
                args: vec!["-NoLogo".to_string()],
            });
        }

        let pwsh_fallbacks: Vec<PathBuf> = [
            env_path("ProgramFiles", r"PowerShell\7\pwsh.exe"),
            env_path("ProgramFiles", r"PowerShell\7-preview\pwsh.exe"),
            env_path("ProgramFiles(x86)", r"PowerShell\7\pwsh.exe"),
            env_path("LOCALAPPDATA", r"Microsoft\PowerShell\pwsh.exe"),
            env_path("USERPROFILE", r".dotnet\tools\pwsh.exe"),
            env_path("USERPROFILE", r"scoop\apps\pwsh\current\pwsh.exe"),
        ]
        .into_iter()
        .flatten()
        .collect();
        if let Some(exe) = find_executable("pwsh.exe", &pwsh_fallbacks) {
            profiles.push(ShellProfile {
                id: "pwsh".to_string(),
                kind: "pwsh".to_string(),
                name: "PowerShell 7".to_string(),
                executable: exe,
                args: vec!["-NoLogo".to_string()],
            });
        }

        let mut cmd_fallbacks = Vec::new();
        if let Some(comspec) = std::env::var_os("ComSpec").map(PathBuf::from) {
            if comspec
                .file_name()
                .and_then(|s| s.to_str())
                .is_some_and(|n| n.eq_ignore_ascii_case("cmd.exe"))
            {
                cmd_fallbacks.push(comspec);
            }
        }
        if let Some(sys_cmd) = env_path("SystemRoot", r"System32\cmd.exe") {
            cmd_fallbacks.push(sys_cmd);
        }
        if let Some(exe) = find_executable("cmd.exe", &cmd_fallbacks) {
            profiles.push(ShellProfile {
                id: "cmd".to_string(),
                kind: "cmd".to_string(),
                name: "CMD".to_string(),
                executable: exe,
                args: Vec::new(),
            });
        }

        if let Some(exe) = find_git_bash() {
            profiles.push(ShellProfile {
                id: "git-bash".to_string(),
                kind: "git-bash".to_string(),
                name: "Git Bash".to_string(),
                executable: exe,
                args: vec!["--login".to_string(), "-i".to_string()],
            });
        }

        let wsl_fallbacks: Vec<PathBuf> = env_path("SystemRoot", r"System32\wsl.exe")
            .into_iter()
            .collect();
        if let Some(wsl_exe) = find_executable("wsl.exe", &wsl_fallbacks) {
            for distro in detect_wsl_distros(&wsl_exe).await {
                profiles.push(ShellProfile {
                    id: format!("wsl:{distro}"),
                    kind: "wsl".to_string(),
                    name: format!("WSL: {distro}"),
                    executable: wsl_exe.clone(),
                    args: vec!["-d".to_string(), distro],
                });
            }
        }

        profiles
    }

    #[cfg(not(windows))]
    {
        vec![default_shell_profile()]
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn parses_wsl_distro_list_utf8_and_utf16() {
        let utf8 = b"Ubuntu\r\ndocker-desktop\r\nDebian\n\ndocker-desktop-data\r\nUbuntu\n";
        assert_eq!(parse_wsl_distro_list(utf8), vec!["Ubuntu", "Debian"]);

        let mut utf16_bom = vec![0xFFu8, 0xFEu8];
        for unit in "Ubuntu-22.04\r\nArch\r\n".encode_utf16() {
            utf16_bom.extend_from_slice(&unit.to_le_bytes());
        }
        assert_eq!(
            parse_wsl_distro_list(&utf16_bom),
            vec!["Ubuntu-22.04", "Arch"]
        );

        let mut utf16_no_bom = Vec::new();
        for unit in "kali-linux\r\n".encode_utf16() {
            utf16_no_bom.extend_from_slice(&unit.to_le_bytes());
        }
        assert_eq!(parse_wsl_distro_list(&utf16_no_bom), vec!["kali-linux"]);
    }

    #[test]
    fn resolves_git_bash_relative_to_git_exe() {
        let tmp = tempfile::tempdir().expect("create tempdir");
        let git_cmd_dir = tmp.path().join("Git").join("cmd");
        let git_bin_dir = tmp.path().join("Git").join("bin");
        fs::create_dir_all(&git_cmd_dir).unwrap();
        fs::create_dir_all(&git_bin_dir).unwrap();

        let git_exe = git_cmd_dir.join("git.exe");
        let bash_exe = git_bin_dir.join("bash.exe");
        fs::write(&git_exe, b"").unwrap();
        fs::write(&bash_exe, b"").unwrap();

        assert_eq!(git_bash_from_git_exe(&git_exe), Some(bash_exe));
    }

    #[tokio::test]
    async fn detects_available_shells_without_hanging() {
        let shells = detect_available_shells().await;
        assert!(!shells.is_empty());
        for profile in &shells {
            assert!(!profile.name.is_empty());
            assert!(!profile.executable.is_empty());
        }
        if let Some(git_bash) = shells.iter().find(|s| s.kind == "git-bash") {
            assert_eq!(git_bash.args, vec!["--login", "-i"]);
        }
        if let Some(cmd) = shells.iter().find(|s| s.kind == "cmd") {
            assert!(cmd.args.is_empty());
        }
    }
}

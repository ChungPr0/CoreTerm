use std::path::{Path, PathBuf};

use crate::ipc::dto::ShellProfile;
use super::wsl::detect_wsl_distros;
#[cfg(test)]
use super::wsl::parse_wsl_distro_list;

fn is_usable_file(path: &Path) -> bool {
    path.is_file() || std::fs::symlink_metadata(path).is_ok_and(|m| !m.is_dir())
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

/// Validates a user-supplied executable path or command name on PATH.
pub fn resolve_shell_exe(input: &str) -> Option<String> {
    let trimmed = input.trim().trim_matches('"');
    if trimmed.is_empty() {
        return None;
    }

    let candidate = Path::new(trimmed);
    let has_path_hint = trimmed.contains('\\') || trimmed.contains('/') || trimmed.contains(':');
    if has_path_hint {
        return is_usable_file(candidate).then(|| trimmed.to_string());
    }

    if let Some(found) = find_in_path(trimmed) {
        return Some(found.to_string_lossy().into_owned());
    }
    #[cfg(windows)]
    if candidate.extension().is_none() {
        if let Some(found) = find_in_path(&format!("{trimmed}.exe")) {
            return Some(found.to_string_lossy().into_owned());
        }
    }
    is_usable_file(candidate).then(|| trimmed.to_string())
}

/// Resolves trusted system paths first before falling back to `PATH` to prevent user-PATH shadowing.
fn find_system_first_executable(exe_name: &str, system_paths: &[PathBuf]) -> Option<String> {
    for candidate in system_paths {
        if is_usable_file(candidate) {
            return Some(candidate.to_string_lossy().into_owned());
        }
    }
    if let Some(p) = find_in_path(exe_name) {
        return Some(p.to_string_lossy().into_owned());
    }
    None
}

fn env_path(var: &str, suffix: &str) -> Option<PathBuf> {
    std::env::var_os(var)
        .filter(|v| !v.is_empty())
        .map(|v| PathBuf::from(v).join(suffix))
}

fn git_bash_from_git_exe(git_exe: &Path) -> Option<PathBuf> {
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

#[cfg(windows)]
fn ps_profile() -> Option<ShellProfile> {
    let fallbacks: Vec<PathBuf> =
        env_path("SystemRoot", r"System32\WindowsPowerShell\v1.0\powershell.exe")
            .into_iter()
            .collect();
    find_system_first_executable("powershell.exe", &fallbacks).map(|exe| ShellProfile {
        id: "powershell".to_string(),
        kind: "powershell".to_string(),
        name: "PowerShell".to_string(),
        executable: exe,
        args: vec!["-NoLogo".to_string()],
    })
}

#[cfg(windows)]
fn pwsh_profile() -> Option<ShellProfile> {
    let fallbacks: Vec<PathBuf> = [
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
    find_system_first_executable("pwsh.exe", &fallbacks).map(|exe| ShellProfile {
        id: "pwsh".to_string(),
        kind: "pwsh".to_string(),
        name: "PowerShell 7".to_string(),
        executable: exe,
        args: vec!["-NoLogo".to_string()],
    })
}

#[cfg(windows)]
fn cmd_profile() -> Option<ShellProfile> {
    let mut fallbacks = Vec::new();
    if let Some(sys_cmd) = env_path("SystemRoot", r"System32\cmd.exe") {
        fallbacks.push(sys_cmd);
    }
    if let Some(comspec) = std::env::var_os("ComSpec").map(PathBuf::from) {
        if comspec
            .file_name()
            .and_then(|s| s.to_str())
            .is_some_and(|n| n.eq_ignore_ascii_case("cmd.exe"))
        {
            fallbacks.push(comspec);
        }
    }
    find_system_first_executable("cmd.exe", &fallbacks).map(|exe| ShellProfile {
        id: "cmd".to_string(),
        kind: "cmd".to_string(),
        name: "CMD".to_string(),
        executable: exe,
        args: Vec::new(),
    })
}

#[cfg(windows)]
fn git_bash_profile() -> Option<ShellProfile> {
    find_git_bash().map(|exe| ShellProfile {
        id: "git-bash".to_string(),
        kind: "git-bash".to_string(),
        name: "Git Bash".to_string(),
        executable: exe,
        args: vec!["--login".to_string(), "-i".to_string()],
    })
}

fn first_profile<I>(candidates: I) -> Option<ShellProfile>
where
    I: IntoIterator<Item = Option<ShellProfile>>,
{
    candidates.into_iter().flatten().next()
}

fn placeholder_shell() -> ShellProfile {
    #[cfg(windows)]
    {
        ShellProfile {
            id: "powershell".to_string(),
            kind: "powershell".to_string(),
            name: "PowerShell".to_string(),
            executable: "powershell.exe".to_string(),
            args: vec!["-NoLogo".to_string()],
        }
    }
    #[cfg(not(windows))]
    {
        ShellProfile {
            id: "sh".to_string(),
            kind: "powershell".to_string(),
            name: "Shell".to_string(),
            executable: std::env::var("SHELL").unwrap_or_else(|_| "/bin/sh".to_string()),
            args: Vec::new(),
        }
    }
}

/// Returns the highest-priority local shell present on disk without spawning subprocesses.
pub fn find_default_shell() -> Option<ShellProfile> {
    #[cfg(windows)]
    {
        first_profile([
            ps_profile(),
            pwsh_profile(),
            cmd_profile(),
            git_bash_profile(),
        ])
    }
    #[cfg(not(windows))]
    {
        let exe = std::env::var("SHELL").unwrap_or_else(|_| "/bin/sh".to_string());
        resolve_shell_exe(&exe).map(|resolved| ShellProfile {
            id: "powershell".to_string(),
            kind: "powershell".to_string(),
            name: Path::new(&resolved)
                .file_name()
                .and_then(|s| s.to_str())
                .unwrap_or("Shell")
                .to_string(),
            executable: resolved,
            args: Vec::new(),
        })
    }
}

pub fn default_shell_profile() -> ShellProfile {
    find_default_shell().unwrap_or_else(placeholder_shell)
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
        profiles.extend(ps_profile());
        profiles.extend(pwsh_profile());
        profiles.extend(cmd_profile());
        profiles.extend(git_bash_profile());

        let wsl_fallbacks: Vec<PathBuf> = env_path("SystemRoot", r"System32\wsl.exe")
            .into_iter()
            .collect();
        if let Some(wsl_exe) = find_system_first_executable("wsl.exe", &wsl_fallbacks) {
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
        find_default_shell().into_iter().collect()
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

    #[test]
    fn first_profile_falls_back_by_priority() {
        let cmd = ShellProfile {
            id: "cmd".into(),
            kind: "cmd".into(),
            name: "CMD".into(),
            executable: "cmd.exe".into(),
            args: Vec::new(),
        };
        let bash = ShellProfile {
            id: "git-bash".into(),
            kind: "git-bash".into(),
            name: "Git Bash".into(),
            executable: "bash.exe".into(),
            args: vec!["--login".into(), "-i".into()],
        };

        assert_eq!(
            first_profile([None, None, Some(cmd.clone()), Some(bash)]),
            Some(cmd)
        );
        assert_eq!(first_profile([None, None]), None);
    }

    #[test]
    fn resolve_shell_exe_validates_files_and_rejects_dirs() {
        let tmp = tempfile::tempdir().expect("create tempdir");
        let dir_path = tmp.path().join("bin");
        fs::create_dir_all(&dir_path).unwrap();
        let exe_path = dir_path.join("custom.exe");
        fs::write(&exe_path, b"").unwrap();

        let exe_str = exe_path.to_string_lossy().to_string();
        assert_eq!(
            resolve_shell_exe(&format!("  \"{exe_str}\"  ")),
            Some(exe_str)
        );
        assert_eq!(resolve_shell_exe(&dir_path.to_string_lossy()), None);
        assert_eq!(
            resolve_shell_exe(&dir_path.join("missing.exe").to_string_lossy()),
            None
        );
        assert_eq!(resolve_shell_exe("   "), None);
        assert_eq!(resolve_shell_exe("  \"\"  "), None);
        assert_eq!(resolve_shell_exe("./nonexistent_custom_shell.exe"), None);
    }

    #[cfg(windows)]
    #[test]
    fn resolve_shell_exe_finds_path_commands_with_and_without_exe_extension() {
        let resolved_bare = resolve_shell_exe("cmd").expect("cmd should resolve from PATH");
        assert!(
            resolved_bare.to_ascii_lowercase().ends_with("cmd.exe"),
            "expected cmd.exe path, got {resolved_bare}"
        );
        let resolved_ext = resolve_shell_exe("cmd.exe").expect("cmd.exe should resolve from PATH");
        assert!(
            resolved_ext.to_ascii_lowercase().ends_with("cmd.exe"),
            "expected cmd.exe path, got {resolved_ext}"
        );
        assert_eq!(
            resolve_shell_exe("definitely_nonexistent_shell_xyz_123"),
            None
        );
    }

    #[test]
    fn is_default_powershell_distinguishes_custom_args() {
        let custom_ps_nologo = ShellProfile {
            id: "custom:ps1".into(),
            kind: "custom".into(),
            name: "Custom PS".into(),
            executable: r"C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe".into(),
            args: vec!["-NoLogo".into()],
        };
        assert!(is_default_powershell(&custom_ps_nologo));

        let custom_ps_with_script = ShellProfile {
            id: "custom:ps2".into(),
            kind: "custom".into(),
            name: "Custom PS Script".into(),
            executable: r"C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe".into(),
            args: vec!["-NoLogo".into(), "-NoProfile".into()],
        };
        assert!(!is_default_powershell(&custom_ps_with_script));
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

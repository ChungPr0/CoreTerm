#[cfg(windows)]
mod launcher;
#[cfg(windows)]
mod pipe;
pub mod protocol;
mod worker;

use std::path::{Component, Path, PathBuf};

#[cfg(windows)]
use std::path::Prefix;

use crate::core::path_guard::clean_display_path;

pub const ELEVATED_PTY_FLAG: &str = "--coreterm-elevated-pty";

const ALLOWED_SHELLS: &[&str] = &["powershell", "pwsh", "cmd", "wsl", "bash"];

#[cfg(windows)]
pub use launcher::spawn_elevated_pty;
#[cfg(windows)]
pub use pipe::{ElevatedPtyConnection, OverlappedPipe, PipeReader, PipeWriter};
pub use protocol::{
    read_frame, write_frame, FRAME_CLOSE, FRAME_DATA, FRAME_ERROR, FRAME_EXIT, FRAME_HANDSHAKE,
    FRAME_RESIZE,
};
pub use worker::run_elevated_worker;

fn normalized_shell_stem(path: &Path) -> Option<String> {
    let raw_name = path.file_name()?.to_str()?.to_ascii_lowercase();
    if raw_name.is_empty() {
        return None;
    }
    let stem = raw_name.strip_suffix(".exe").unwrap_or(&raw_name);
    Some(stem.to_string())
}

fn normalized_components_lower(path: &Path) -> Vec<String> {
    let cleaned = clean_display_path(path);
    Path::new(&cleaned)
        .components()
        .map(|c| c.as_os_str().to_string_lossy().to_ascii_lowercase())
        .collect()
}

fn is_path_under_root(candidate_parent: &Path, trusted_root: &Path) -> bool {
    let parent_comps = normalized_components_lower(candidate_parent);
    let root_comps = normalized_components_lower(trusted_root);
    if root_comps.is_empty() || parent_comps.len() < root_comps.len() {
        return false;
    }
    parent_comps[..root_comps.len()] == root_comps[..]
}

#[cfg(windows)]
fn is_local_drive_path(path: &Path) -> bool {
    match path.components().next() {
        Some(Component::Prefix(prefix)) => {
            matches!(prefix.kind(), Prefix::Disk(_) | Prefix::VerbatimDisk(_))
        }
        _ => false,
    }
}

#[cfg(windows)]
fn is_disallowed_windows_subdir(canon_parent: &Path) -> bool {
    let Some(win_dir) = crate::infra::os::known_folders::known_windows_dir() else {
        return false;
    };
    let canon_win = std::fs::canonicalize(&win_dir).unwrap_or(win_dir);
    for blocked in ["Temp", "Tasks", "Tracing", r"Registration\CRMLog"] {
        let blocked_dir = canon_win.join(blocked);
        if is_path_under_root(canon_parent, &blocked_dir) {
            return true;
        }
    }
    false
}

fn is_trusted_elevated_parent_dir(canon_exe_path: &Path) -> bool {
    let Some(parent) = canon_exe_path.parent() else {
        return false;
    };
    if parent.as_os_str().is_empty() {
        return false;
    }

    #[cfg(windows)]
    {
        if !is_local_drive_path(canon_exe_path) || is_disallowed_windows_subdir(parent) {
            return false;
        }
        let trusted_roots = crate::infra::os::known_folders::trusted_elevated_shell_roots();
        trusted_roots
            .iter()
            .any(|root| is_path_under_root(parent, root))
    }

    #[cfg(not(windows))]
    {
        let trusted_roots = [Path::new("/bin"), Path::new("/usr/bin"), Path::new("/usr/local/bin")];
        trusted_roots
            .iter()
            .any(|root| is_path_under_root(parent, root))
    }
}

fn is_bare_filename(trimmed: &str) -> bool {
    if trimmed.contains(['\\', '/', ':']) {
        return false;
    }
    let mut comps = Path::new(trimmed).components();
    matches!(comps.next(), Some(Component::Normal(_))) && comps.next().is_none()
}

/// Explicitly resolves bare elevated shell names (e.g. `powershell.exe`, `cmd.exe`, `pwsh.exe`,
/// `wsl.exe`, `bash.exe`) strictly against verified OS known folders (`SHGetKnownFolderPath`),
/// never consulting CWD, the app directory, or mutable `PATH`/environment variables.
/// Non-bare paths are returned trimmed for strict validation by [`validate_elevated_shell`].
pub fn resolve_elevated_shell_executable(executable: &str) -> Result<String, String> {
    let trimmed = executable.trim().trim_matches('"');
    if trimmed.is_empty() {
        return Err("Elevated shell executable cannot be empty".to_string());
    }
    if !is_bare_filename(trimmed) {
        return Ok(trimmed.to_string());
    }

    let lower = trimmed.to_ascii_lowercase();
    let stem = lower.strip_suffix(".exe").unwrap_or(&lower);
    if !ALLOWED_SHELLS.contains(&stem) {
        return Err(format!(
            "Executable '{trimmed}' is not an authorized interactive shell for elevated execution"
        ));
    }

    #[cfg(windows)]
    {
        let mut candidates: Vec<PathBuf> = Vec::new();
        match stem {
            "cmd" => {
                if let Some(sys32) = crate::infra::os::known_folders::system32_dir() {
                    candidates.push(sys32.join("cmd.exe"));
                }
            }
            "powershell" => {
                if let Some(sys32) = crate::infra::os::known_folders::system32_dir() {
                    candidates.push(sys32.join(r"WindowsPowerShell\v1.0\powershell.exe"));
                }
            }
            "wsl" => {
                if let Some(sys32) = crate::infra::os::known_folders::system32_dir() {
                    candidates.push(sys32.join("wsl.exe"));
                }
                for pf in crate::infra::os::known_folders::known_program_files_dirs() {
                    candidates.push(pf.join(r"WSL\wsl.exe"));
                }
            }
            "pwsh" => {
                for pf in crate::infra::os::known_folders::known_program_files_dirs() {
                    candidates.push(pf.join(r"PowerShell\7\pwsh.exe"));
                    candidates.push(pf.join(r"PowerShell\7-preview\pwsh.exe"));
                }
            }
            "bash" => {
                for pf in crate::infra::os::known_folders::known_program_files_dirs() {
                    candidates.push(pf.join(r"Git\bin\bash.exe"));
                    candidates.push(pf.join(r"Git\usr\bin\bash.exe"));
                }
            }
            _ => {}
        }

        for candidate in candidates {
            if let Ok(canon) = std::fs::canonicalize(&candidate) {
                if canon.is_file() {
                    return Ok(clean_display_path(&canon));
                }
            }
        }

        Err(format!(
            "Executable '{trimmed}' is not an authorized interactive shell for elevated execution"
        ))
    }

    #[cfg(not(windows))]
    {
        for dir in ["/bin", "/usr/bin", "/usr/local/bin"] {
            let candidate = Path::new(dir).join(stem);
            if let Ok(canon) = std::fs::canonicalize(&candidate) {
                if canon.is_file() {
                    return Ok(clean_display_path(&canon));
                }
            }
        }
        Err(format!(
            "Executable '{trimmed}' is not an authorized interactive shell for elevated execution"
        ))
    }
}

/// Validates that an executable and its arguments represent an authorized interactive shell
/// for UAC-elevated execution, blocking relative paths, bare filenames, path traversal,
/// arbitrary binaries, and non-interactive command execution.
pub fn validate_elevated_shell(executable: &str, args: &[String]) -> Result<(), String> {
    let trimmed_exe = executable.trim().trim_matches('"');
    if trimmed_exe.is_empty() {
        return Err("Elevated shell executable cannot be empty".to_string());
    }

    let unauthorized = || {
        Err(format!(
            "Executable '{trimmed_exe}' is not an authorized interactive shell for elevated execution"
        ))
    };

    let exe_path = Path::new(trimmed_exe);
    if !exe_path.is_absolute()
        || exe_path.components().any(|c| {
            matches!(c, Component::ParentDir)
                || matches!(c, Component::Normal(seg) if seg == "..")
        })
    {
        return unauthorized();
    }

    #[cfg(windows)]
    if !is_local_drive_path(exe_path) {
        return unauthorized();
    }

    let Some(raw_stem) = normalized_shell_stem(exe_path) else {
        return unauthorized();
    };
    if !ALLOWED_SHELLS.contains(&raw_stem.as_str()) {
        return unauthorized();
    }

    let Ok(canon_exe) = std::fs::canonicalize(exe_path) else {
        return unauthorized();
    };
    if !canon_exe.is_file() {
        return unauthorized();
    }

    let Some(canon_stem) = normalized_shell_stem(&canon_exe) else {
        return unauthorized();
    };
    if !ALLOWED_SHELLS.contains(&canon_stem.as_str())
        || !is_trusted_elevated_parent_dir(&canon_exe)
    {
        return unauthorized();
    }

    let name = canon_stem.as_str();
    let mut idx = 0;
    while idx < args.len() {
        let arg = &args[idx];
        if arg.contains(['\0', '\r', '\n']) {
            return Err("Elevated shell argument contains control or null bytes".to_string());
        }
        let trimmed_arg = arg.trim();
        let lower = trimmed_arg.to_ascii_lowercase();

        match name {
            "cmd" => {
                if !matches!(lower.as_str(), "/d" | "/q") {
                    return Err(format!(
                        "Argument '{arg}' is not permitted for elevated cmd shell (non-interactive execution blocked)"
                    ));
                }
            }
            "powershell" | "pwsh" => {
                const ALLOWED_PS_FLAGS: &[&str] = &[
                    "-nologo",
                    "-noprofile",
                    "-noexit",
                    "-sta",
                    "-mta",
                    "/nologo",
                    "/noprofile",
                    "/noexit",
                ];
                if !ALLOWED_PS_FLAGS.contains(&lower.as_str()) {
                    return Err(format!(
                        "Argument '{arg}' is not permitted for elevated PowerShell shell (non-interactive execution blocked)"
                    ));
                }
            }
            "bash" => {
                const ALLOWED_BASH_FLAGS: &[&str] = &["--login", "-i", "-l"];
                if !ALLOWED_BASH_FLAGS.contains(&lower.as_str()) {
                    return Err(format!(
                        "Argument '{arg}' is not permitted for elevated bash shell (non-interactive execution blocked)"
                    ));
                }
            }
            "wsl" => {
                if lower == "-d" || lower == "--distribution" {
                    let Some(distro) = args.get(idx + 1) else {
                        return Err(format!(
                            "Argument '{arg}' is not permitted for elevated WSL shell (non-interactive execution blocked)"
                        ));
                    };
                    let d_trim = distro.trim();
                    if d_trim.is_empty()
                        || d_trim.starts_with('-')
                        || distro.contains(['\0', '\r', '\n', '/', '\\'])
                    {
                        return Err(format!(
                            "Argument '{distro}' is not permitted for elevated WSL shell (non-interactive execution blocked)"
                        ));
                    }
                    idx += 2;
                    continue;
                }
                return Err(format!(
                    "Argument '{arg}' is not permitted for elevated WSL shell (non-interactive execution blocked)"
                ));
            }
            _ => {}
        }
        idx += 1;
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[cfg(windows)]
    #[test]
    fn test_validate_elevated_shell_accepts_standard_interactive_shells() {
        assert!(validate_elevated_shell(
            r"C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe",
            &["-NoLogo".into()]
        )
        .is_ok());
        assert!(validate_elevated_shell(r"C:\Windows\System32\cmd.exe", &[]).is_ok());
        assert!(validate_elevated_shell(r"\\?\C:\Windows\System32\cmd.exe", &["/Q".into()]).is_ok());

        for (candidate, args) in [
            (r"C:\Program Files\PowerShell\7\pwsh.exe", vec!["-NoLogo".into()]),
            (
                r"C:\Program Files\Git\bin\bash.exe",
                vec!["--login".into(), "-i".into()],
            ),
            (
                r"C:\Windows\System32\wsl.exe",
                vec!["-d".into(), "Ubuntu".into()],
            ),
        ] {
            if Path::new(candidate).is_file() {
                assert!(
                    validate_elevated_shell(candidate, &args).is_ok(),
                    "expected {candidate} to validate"
                );
            }
        }
    }

    #[cfg(windows)]
    #[test]
    fn test_resolve_elevated_shell_executable_uses_known_folders() {
        let cmd = resolve_elevated_shell_executable("cmd.exe").expect("resolve cmd.exe");
        assert!(validate_elevated_shell(&cmd, &[]).is_ok());

        let ps =
            resolve_elevated_shell_executable("powershell.exe").expect("resolve powershell.exe");
        assert!(validate_elevated_shell(&ps, &["-NoLogo".into()]).is_ok());

        assert!(resolve_elevated_shell_executable("calc.exe").is_err());
        assert!(resolve_elevated_shell_executable("").is_err());
    }

    #[test]
    fn test_validate_elevated_shell_rejects_bare_filenames_relative_paths_and_traversal() {
        assert!(validate_elevated_shell("cmd.exe", &[]).is_err());
        assert!(validate_elevated_shell("powershell.exe", &["-NoLogo".into()]).is_err());
        assert!(validate_elevated_shell("pwsh.exe", &["-NoLogo".into()]).is_err());
        assert!(validate_elevated_shell("wsl.exe", &["-d".into(), "Ubuntu".into()]).is_err());
        assert!(validate_elevated_shell("bash.exe", &["--login".into()]).is_err());
        assert!(validate_elevated_shell(r".\cmd.exe", &[]).is_err());
        assert!(validate_elevated_shell(r"System32\cmd.exe", &[]).is_err());
        assert!(
            validate_elevated_shell(r"C:\Windows\System32\..\System32\cmd.exe", &[]).is_err()
        );
        assert!(
            validate_elevated_shell(r"C:\Windows\System32\..\..\Users\Public\cmd.exe", &[])
                .is_err()
        );
        assert!(validate_elevated_shell(r"C:\Program Files\..\Windows\System32\cmd.exe", &[])
            .is_err());
        assert!(validate_elevated_shell(
            r"\\?\C:\Windows\System32\..\System32\cmd.exe",
            &[]
        )
        .is_err());
        assert!(validate_elevated_shell(
            r"C:\Windows\System32\cmd.exe",
            &["/Q\n".into()]
        )
        .is_err());
    }

    #[test]
    fn test_validate_elevated_shell_rejects_unauthorized_binaries_and_untrusted_dirs() {
        assert!(validate_elevated_shell("calc.exe", &[]).is_err());
        assert!(validate_elevated_shell(r"C:\Windows\System32\notepad.exe", &[]).is_err());
        assert!(validate_elevated_shell("python.exe", &["-c".into(), "print(1)".into()]).is_err());
        assert!(validate_elevated_shell("", &[]).is_err());
        assert!(validate_elevated_shell(r"C:\Users\Public\cmd.exe", &[]).is_err());
        assert!(validate_elevated_shell(r"\\attacker\share\powershell.exe", &[]).is_err());
        assert!(validate_elevated_shell(r"C:\Windows\Temp\cmd.exe", &[]).is_err());
    }

    #[cfg(windows)]
    #[test]
    fn test_validate_elevated_shell_rejects_non_interactive_command_flags_and_abbreviations() {
        let cmd = r"C:\Windows\System32\cmd.exe";
        let ps = r"C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe";
        assert!(validate_elevated_shell(cmd, &["/c".into(), "whoami".into()]).is_err());
        assert!(validate_elevated_shell(cmd, &["/k".into(), "whoami".into()]).is_err());
        assert!(validate_elevated_shell(cmd, &["/cwhoami".into()]).is_err());
        assert!(validate_elevated_shell(ps, &["-Command".into(), "whoami".into()]).is_err());
        assert!(validate_elevated_shell(ps, &["-com".into(), "whoami".into()]).is_err());
        assert!(validate_elevated_shell(ps, &["-c".into(), "whoami".into()]).is_err());
        assert!(validate_elevated_shell(ps, &["/c".into(), "whoami".into()]).is_err());
        assert!(validate_elevated_shell(
            ps,
            &["-EncodedCommand".into(), "dwBoAG8AYQBtAGkA".into()]
        )
        .is_err());
        assert!(
            validate_elevated_shell(ps, &["-enc".into(), "dwBoAG8AYQBtAGkA".into()]).is_err()
        );
        assert!(validate_elevated_shell(ps, &["-File".into(), "script.ps1".into()]).is_err());

        let wsl = r"C:\Windows\System32\wsl.exe";
        if Path::new(wsl).is_file() {
            assert!(validate_elevated_shell(wsl, &["--exec".into(), "whoami".into()]).is_err());
            assert!(validate_elevated_shell(wsl, &["-e".into(), "whoami".into()]).is_err());
            assert!(validate_elevated_shell(wsl, &["whoami".into()]).is_err());
        }
    }
}

#[cfg(windows)]
mod launcher;
#[cfg(windows)]
mod pipe;
pub mod protocol;
mod worker;

pub const ELEVATED_PTY_FLAG: &str = "--coreterm-elevated-pty";

#[cfg(windows)]
pub use launcher::spawn_elevated_pty;
#[cfg(windows)]
pub use pipe::{ElevatedPtyConnection, OverlappedPipe, PipeReader, PipeWriter};
pub use protocol::{
    read_frame, write_frame, FRAME_CLOSE, FRAME_DATA, FRAME_ERROR, FRAME_EXIT, FRAME_RESIZE,
};
pub use worker::run_elevated_worker;

fn is_trusted_elevated_parent_dir(exe_path: &std::path::Path) -> bool {
    let Some(parent) = exe_path.parent() else {
        return true;
    };
    if parent.as_os_str().is_empty() {
        return true;
    }
    let parent_lower = parent.to_string_lossy().replace('/', "\\").to_ascii_lowercase();
    if parent_lower.starts_with(r"\\") || !exe_path.is_absolute() {
        return false;
    }

    let mut trusted_roots = vec![
        r"c:\windows\system32".to_string(),
        r"c:\program files".to_string(),
        r"c:\program files (x86)".to_string(),
    ];
    for var in ["WINDIR", "SystemRoot", "ProgramFiles", "ProgramFiles(x86)"] {
        if let Ok(val) = std::env::var(var) {
            let clean = val.trim().trim_end_matches(['\\', '/']).to_ascii_lowercase();
            if !clean.is_empty() {
                trusted_roots.push(clean);
            }
        }
    }

    trusted_roots.iter().any(|root| {
        parent_lower == *root || parent_lower.starts_with(&format!("{root}\\"))
    })
}

/// Validates that an executable and its arguments represent an authorized interactive shell
/// for UAC-elevated execution, blocking arbitrary binaries and non-interactive command execution.
pub fn validate_elevated_shell(executable: &str, args: &[String]) -> Result<(), String> {
    let trimmed_exe = executable.trim().trim_matches('"');
    if trimmed_exe.is_empty() {
        return Err("Elevated shell executable cannot be empty".to_string());
    }

    let exe_path = std::path::Path::new(trimmed_exe);
    let raw_name = exe_path
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();

    let name = raw_name.strip_suffix(".exe").unwrap_or(&raw_name);

    const ALLOWED_SHELLS: &[&str] = &["powershell", "pwsh", "cmd", "wsl", "bash"];
    if !ALLOWED_SHELLS.contains(&name) || !is_trusted_elevated_parent_dir(exe_path) {
        return Err(format!(
            "Executable '{trimmed_exe}' is not an authorized interactive shell for elevated execution"
        ));
    }

    let mut idx = 0;
    while idx < args.len() {
        let arg = &args[idx];
        let trimmed_arg = arg.trim();
        if trimmed_arg.contains(['\0', '\r', '\n']) {
            return Err("Elevated shell argument contains null bytes".to_string());
        }
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
                        || d_trim.contains(['\0', '\r', '\n', '/', '\\'])
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

    #[test]
    fn test_validate_elevated_shell_accepts_standard_interactive_shells() {
        assert!(validate_elevated_shell("powershell.exe", &["-NoLogo".into()]).is_ok());
        assert!(validate_elevated_shell(
            r"C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe",
            &["-NoLogo".into()]
        )
        .is_ok());
        assert!(validate_elevated_shell("pwsh.exe", &["-NoLogo".into()]).is_ok());
        assert!(validate_elevated_shell(r"C:\Program Files\PowerShell\7\pwsh.exe", &[]).is_ok());
        assert!(validate_elevated_shell("cmd.exe", &[]).is_ok());
        assert!(validate_elevated_shell(r"C:\Windows\System32\cmd.exe", &[]).is_ok());
        assert!(validate_elevated_shell(
            r"C:\Program Files\Git\bin\bash.exe",
            &["--login".into(), "-i".into()]
        )
        .is_ok());
        assert!(validate_elevated_shell("wsl.exe", &["-d".into(), "Ubuntu".into()]).is_ok());
    }

    #[test]
    fn test_validate_elevated_shell_rejects_unauthorized_binaries_and_untrusted_dirs() {
        assert!(validate_elevated_shell("calc.exe", &[]).is_err());
        assert!(validate_elevated_shell(r"C:\Windows\System32\notepad.exe", &[]).is_err());
        assert!(validate_elevated_shell("python.exe", &["-c".into(), "print(1)".into()]).is_err());
        assert!(validate_elevated_shell("", &[]).is_err());
        assert!(validate_elevated_shell(r"C:\Users\Public\cmd.exe", &[]).is_err());
        assert!(validate_elevated_shell(r"\\attacker\share\powershell.exe", &[]).is_err());
        assert!(validate_elevated_shell(r".\cmd.exe", &[]).is_err());
    }

    #[test]
    fn test_validate_elevated_shell_rejects_non_interactive_command_flags_and_abbreviations() {
        assert!(validate_elevated_shell("cmd.exe", &["/c".into(), "whoami".into()]).is_err());
        assert!(validate_elevated_shell("cmd.exe", &["/k".into(), "whoami".into()]).is_err());
        assert!(validate_elevated_shell("cmd.exe", &["/cwhoami".into()]).is_err());
        assert!(validate_elevated_shell("powershell.exe", &["-Command".into(), "whoami".into()]).is_err());
        assert!(validate_elevated_shell("powershell.exe", &["-com".into(), "whoami".into()]).is_err());
        assert!(validate_elevated_shell("pwsh.exe", &["-c".into(), "whoami".into()]).is_err());
        assert!(validate_elevated_shell("pwsh.exe", &["/c".into(), "whoami".into()]).is_err());
        assert!(validate_elevated_shell(
            "powershell.exe",
            &["-EncodedCommand".into(), "dwBoAG8AYQBtAGkA".into()]
        )
        .is_err());
        assert!(validate_elevated_shell(
            "powershell.exe",
            &["-enc".into(), "dwBoAG8AYQBtAGkA".into()]
        )
        .is_err());
        assert!(validate_elevated_shell("powershell.exe", &["-File".into(), "script.ps1".into()]).is_err());
        assert!(validate_elevated_shell("bash.exe", &["-c".into(), "whoami".into()]).is_err());
        assert!(validate_elevated_shell("bash.exe", &["-ic".into(), "whoami".into()]).is_err());
        assert!(validate_elevated_shell("bash.exe", &["evil.sh".into()]).is_err());
        assert!(validate_elevated_shell("wsl.exe", &["--exec".into(), "whoami".into()]).is_err());
        assert!(validate_elevated_shell("wsl.exe", &["-e".into(), "whoami".into()]).is_err());
        assert!(validate_elevated_shell("wsl.exe", &["whoami".into()]).is_err());
    }
}

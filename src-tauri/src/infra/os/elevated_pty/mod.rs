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
    if !ALLOWED_SHELLS.contains(&name) {
        return Err(format!(
            "Executable '{trimmed_exe}' is not an authorized interactive shell for elevated execution"
        ));
    }

    for arg in args {
        let trimmed_arg = arg.trim();
        if trimmed_arg.contains('\0') {
            return Err("Elevated shell argument contains null bytes".to_string());
        }
        let lower = trimmed_arg.to_ascii_lowercase();

        match name {
            "cmd" => {
                if lower == "/c" || lower.starts_with("/c:") {
                    return Err(format!(
                        "Argument '{arg}' is not permitted for elevated cmd shell (non-interactive execution blocked)"
                    ));
                }
            }
            "powershell" | "pwsh" => {
                if lower == "-c"
                    || lower == "-command"
                    || lower.starts_with("-command:")
                    || lower == "-encodedcommand"
                    || lower.starts_with("-encodedcommand:")
                    || lower == "-e"
                    || lower == "-file"
                    || lower.starts_with("-file:")
                    || lower == "-f"
                {
                    return Err(format!(
                        "Argument '{arg}' is not permitted for elevated PowerShell shell (non-interactive execution blocked)"
                    ));
                }
            }
            "bash" => {
                if lower == "-c" {
                    return Err(format!(
                        "Argument '{arg}' is not permitted for elevated bash shell (non-interactive execution blocked)"
                    ));
                }
            }
            "wsl" if lower == "-e" || lower == "--exec" => {
                return Err(format!(
                    "Argument '{arg}' is not permitted for elevated WSL shell (non-interactive execution blocked)"
                ));
            }
            _ => {}
        }
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
    fn test_validate_elevated_shell_rejects_unauthorized_binaries() {
        assert!(validate_elevated_shell("calc.exe", &[]).is_err());
        assert!(validate_elevated_shell(r"C:\Windows\System32\notepad.exe", &[]).is_err());
        assert!(validate_elevated_shell("python.exe", &["-c".into(), "print(1)".into()]).is_err());
        assert!(validate_elevated_shell("", &[]).is_err());
    }

    #[test]
    fn test_validate_elevated_shell_rejects_non_interactive_command_flags() {
        assert!(validate_elevated_shell("cmd.exe", &["/c".into(), "whoami".into()]).is_err());
        assert!(validate_elevated_shell("powershell.exe", &["-Command".into(), "whoami".into()]).is_err());
        assert!(validate_elevated_shell("pwsh.exe", &["-c".into(), "whoami".into()]).is_err());
        assert!(validate_elevated_shell("powershell.exe", &["-EncodedCommand".into(), "dwBoAG8AYQBtAGkA".into()]).is_err());
        assert!(validate_elevated_shell("powershell.exe", &["-File".into(), "script.ps1".into()]).is_err());
        assert!(validate_elevated_shell("bash.exe", &["-c".into(), "whoami".into()]).is_err());
        assert!(validate_elevated_shell("wsl.exe", &["--exec".into(), "whoami".into()]).is_err());
        assert!(validate_elevated_shell("wsl.exe", &["-e".into(), "whoami".into()]).is_err());
    }
}


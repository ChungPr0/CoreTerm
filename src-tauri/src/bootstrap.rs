use crate::core::path_guard::clean_display_path_str;
use crate::infra::os::elevated_pty::{run_elevated_worker, ELEVATED_PTY_FLAG};
use crate::pty::askpass::{run_askpass_helper, should_run_askpass_helper, ASKPASS_FLAG};

/// Runs elevated ConPTY named-pipe relay, SSH askpass helper, or CLI helper flags before GUI bootstrap.
pub fn maybe_run_cli_helpers() -> Option<i32> {
    if should_run_askpass_helper() {
        return Some(run_askpass_helper());
    }
    let args: Vec<String> = std::env::args().skip(1).collect();
    if let Some(first) = args.first() {
        if first == ASKPASS_FLAG {
            return Some(run_askpass_helper());
        }
        if first == ELEVATED_PTY_FLAG {
            return Some(run_elevated_worker(&args[1..]));
        }
        if first == "--register-context-menu" {
            match crate::infra::os::context_menu::register_context_menu() {
                Ok(_) => {
                    println!("Successfully registered 'Open in CoreTerm' context menu.");
                    return Some(0);
                }
                Err(e) => {
                    eprintln!("Failed to register context menu: {e}");
                    return Some(1);
                }
            }
        }
        if first == "--unregister-context-menu" {
            let _ = crate::infra::os::context_menu::unregister_context_menu();
            println!("Successfully unregistered 'Open in CoreTerm' context menu.");
            return Some(0);
        }
    }
    None
}

/// Represents a validated filesystem target passed via CLI or Windows Explorer context menu.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum LaunchTarget {
    Directory(String),
    File(String),
}

/// Parses and cleans a directory or file path passed via CLI or context menu launch.
/// Removes Windows extended-length prefix (`\\?\` or `\\?\UNC\`) which causes
/// PowerShell to display `Microsoft.PowerShell.Core\FileSystem::\\?\C:\...` in prompts.
pub fn parse_clean_launch_target_with_base(
    raw: &str,
    base_dir: Option<&std::path::Path>,
) -> Option<LaunchTarget> {
    if raw.starts_with('-') {
        return None;
    }
    let trimmed = raw.trim().trim_matches('"');
    if trimmed.is_empty() {
        return None;
    }
    let normalized = if cfg!(windows) && trimmed.len() == 2 && trimmed.as_bytes()[1] == b':' {
        format!("{trimmed}\\")
    } else {
        trimmed.to_string()
    };
    let raw_path = std::path::Path::new(&normalized);
    let resolved_path = if raw_path.is_absolute() {
        raw_path.to_path_buf()
    } else if let Some(base) = base_dir {
        base.join(raw_path)
    } else {
        std::env::current_dir()
            .map(|cwd| cwd.join(raw_path))
            .unwrap_or_else(|_| raw_path.to_path_buf())
    };
    let meta = std::fs::metadata(&resolved_path).ok()?;
    let abs_path = if raw_path.is_absolute() {
        resolved_path
    } else {
        std::fs::canonicalize(&resolved_path).unwrap_or(resolved_path)
    };
    let clean = clean_display_path_str(&abs_path.to_string_lossy());
    if meta.is_dir() {
        Some(LaunchTarget::Directory(clean))
    } else if meta.is_file() {
        Some(LaunchTarget::File(clean))
    } else {
        None
    }
}

pub fn parse_clean_launch_target(raw: &str) -> Option<LaunchTarget> {
    parse_clean_launch_target_with_base(raw, None)
}

/// Parses and cleans a directory path passed via CLI or context menu launch.
pub fn parse_clean_launch_dir(raw: &str) -> Option<String> {
    match parse_clean_launch_target(raw) {
        Some(LaunchTarget::Directory(dir)) => Some(dir),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_directory_and_file_launch_targets() {
        let temp_dir = std::env::temp_dir().join(format!(
            "coreterm_launch_target_test_{}",
            std::process::id()
        ));
        let _ = std::fs::create_dir_all(&temp_dir);
        let temp_file = temp_dir.join("sample.txt");
        std::fs::write(&temp_file, "hello").expect("write temp file");

        let dir_str = temp_dir.to_string_lossy().to_string();
        let file_str = temp_file.to_string_lossy().to_string();

        assert!(matches!(
            parse_clean_launch_target(&dir_str),
            Some(LaunchTarget::Directory(_))
        ));
        assert!(matches!(
            parse_clean_launch_target(&format!("\"{file_str}\"")),
            Some(LaunchTarget::File(_))
        ));
        assert!(matches!(
            parse_clean_launch_target_with_base("sample.txt", Some(&temp_dir)),
            Some(LaunchTarget::File(p)) if p.ends_with("sample.txt")
        ));
        assert_eq!(parse_clean_launch_target("--register-context-menu"), None);
        assert_eq!(parse_clean_launch_target(""), None);
        assert_eq!(
            parse_clean_launch_target(&temp_dir.join("nonexistent_12345.txt").to_string_lossy()),
            None
        );
        assert!(parse_clean_launch_dir(&file_str).is_none());
        assert!(parse_clean_launch_dir(&dir_str).is_some());

        let _ = std::fs::remove_dir_all(&temp_dir);
    }
}

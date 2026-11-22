use crate::core::path_guard::clean_display_path_str;
use crate::infra::os::elevated_pty::{run_elevated_worker, ELEVATED_PTY_FLAG};

/// Runs elevated ConPTY named-pipe relay or CLI helper flags before GUI bootstrap.
pub fn maybe_run_cli_helpers() -> Option<i32> {
    let args: Vec<String> = std::env::args().skip(1).collect();
    if let Some(first) = args.first() {
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

/// Parses and cleans a directory path passed via CLI or context menu launch.
/// Removes Windows extended-length prefix (`\\?\` or `\\?\UNC\`) which causes
/// PowerShell to display `Microsoft.PowerShell.Core\FileSystem::\\?\C:\...` in prompts.
pub fn parse_clean_launch_dir(raw: &str) -> Option<String> {
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
    let p = std::path::Path::new(&normalized);
    if !p.exists() || !p.is_dir() {
        return None;
    }
    let abs_path = if p.is_absolute() {
        p.to_path_buf()
    } else {
        std::env::current_dir()
            .map(|cwd| cwd.join(p))
            .unwrap_or_else(|_| p.to_path_buf())
    };
    Some(clean_display_path_str(&abs_path.to_string_lossy()))
}

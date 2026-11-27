use serde::{Deserialize, Serialize};
use std::path::Path;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum InstallKind {
    Dev,
    Nsis,
    Msi,
    Portable,
}

impl InstallKind {
    pub fn can_install_in_app(self) -> bool {
        matches!(self, InstallKind::Nsis | InstallKind::Msi)
    }

    pub fn supports_silent_auto_download(self) -> bool {
        matches!(self, InstallKind::Nsis)
    }
}

/// Pure classifier for Windows executable paths so all distribution modes can be unit-tested.
pub fn classify_install_path(
    exe_path: &Path,
    is_debug_build: bool,
    has_uninstaller_sibling: bool,
    program_files: Option<&str>,
    program_files_x86: Option<&str>,
    local_app_data: Option<&str>,
) -> InstallKind {
    if is_debug_build {
        return InstallKind::Dev;
    }

    let file_name = exe_path
        .file_name()
        .unwrap_or_default()
        .to_string_lossy()
        .to_ascii_lowercase();
    if file_name.contains("portable") {
        return InstallKind::Portable;
    }

    if has_uninstaller_sibling {
        return InstallKind::Nsis;
    }

    let full_lower = exe_path
        .to_string_lossy()
        .replace('/', "\\")
        .to_ascii_lowercase();

    let in_dir_prefix = |raw_dir: Option<&str>| -> bool {
        let Some(dir) = raw_dir else {
            return false;
        };
        let trimmed = dir.trim().replace('/', "\\").to_ascii_lowercase();
        if trimmed.is_empty() {
            return false;
        }
        let prefix = if trimmed.ends_with('\\') {
            trimmed
        } else {
            format!("{trimmed}\\")
        };
        full_lower.starts_with(&prefix)
    };

    if in_dir_prefix(program_files) || in_dir_prefix(program_files_x86) {
        return InstallKind::Msi;
    }

    if let Some(local) = local_app_data {
        let trimmed = local
            .trim()
            .replace('/', "\\")
            .trim_end_matches('\\')
            .to_ascii_lowercase();
        if !trimmed.is_empty() {
            let programs_prefix = format!("{trimmed}\\programs\\");
            if full_lower.starts_with(&programs_prefix) {
                return InstallKind::Msi;
            }
        }
    }

    InstallKind::Portable
}

pub fn detect_install_kind() -> InstallKind {
    let is_debug = cfg!(debug_assertions);
    let Ok(exe) = std::env::current_exe() else {
        return if is_debug {
            InstallKind::Dev
        } else {
            InstallKind::Portable
        };
    };

    let has_uninstaller = exe.parent().is_some_and(|parent| {
        parent.join("uninstall.exe").is_file()
            || parent.join("Uninstall CoreTerm.exe").is_file()
    });

    classify_install_path(
        &exe,
        is_debug,
        has_uninstaller,
        std::env::var("ProgramFiles").ok().as_deref(),
        std::env::var("ProgramFiles(x86)").ok().as_deref(),
        std::env::var("LOCALAPPDATA").ok().as_deref(),
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::Path;

    #[test]
    fn classifies_dev_nsis_msi_and_portable_accurately() {
        assert_eq!(
            classify_install_path(
                Path::new(r"D:\Workspace\core_term\target\debug\coreterm.exe"),
                true,
                false,
                Some(r"C:\Program Files"),
                Some(r"C:\Program Files (x86)"),
                Some(r"C:\Users\dev\AppData\Local"),
            ),
            InstallKind::Dev
        );

        assert_eq!(
            classify_install_path(
                Path::new(r"C:\Users\dev\AppData\Local\CoreTerm\coreterm.exe"),
                false,
                true,
                Some(r"C:\Program Files"),
                Some(r"C:\Program Files (x86)"),
                Some(r"C:\Users\dev\AppData\Local"),
            ),
            InstallKind::Nsis
        );

        assert_eq!(
            classify_install_path(
                Path::new(r"C:\Program Files\CoreTerm\coreterm.exe"),
                false,
                false,
                Some(r"C:\Program Files"),
                Some(r"C:\Program Files (x86)"),
                Some(r"C:\Users\dev\AppData\Local"),
            ),
            InstallKind::Msi
        );

        assert_eq!(
            classify_install_path(
                Path::new(r"D:\Tools\CoreTerm_x64_portable.exe"),
                false,
                false,
                Some(r"C:\Program Files"),
                Some(r"C:\Program Files (x86)"),
                Some(r"C:\Users\dev\AppData\Local"),
            ),
            InstallKind::Portable
        );

        assert_eq!(
            classify_install_path(
                Path::new(r"D:\Tools\coreterm.exe"),
                false,
                false,
                Some(r"C:\Program Files"),
                Some(r"C:\Program Files (x86)"),
                Some(r"C:\Users\dev\AppData\Local"),
            ),
            InstallKind::Portable
        );
    }
}

use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

const PREFS_FILE_NAME: &str = "startup_prefs.json";

fn default_new_instance_behavior() -> String {
    "attach".to_string()
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct StartupPrefs {
    #[serde(default = "default_new_instance_behavior")]
    pub new_instance_behavior: String,
}

impl Default for StartupPrefs {
    fn default() -> Self {
        Self {
            new_instance_behavior: default_new_instance_behavior(),
        }
    }
}

#[cfg(windows)]
pub fn resolve_early_app_data_dir() -> Option<PathBuf> {
    crate::infra::os::known_folders::known_folder_path(
        &windows_sys::Win32::UI::Shell::FOLDERID_RoamingAppData,
    )
    .map(|p| p.join("CoreTerm"))
    .or_else(|| std::env::var_os("APPDATA").map(|p| PathBuf::from(p).join("CoreTerm")))
}

#[cfg(not(windows))]
pub fn resolve_early_app_data_dir() -> Option<PathBuf> {
    None
}

pub fn read_startup_prefs_from_dir(dir: &Path) -> StartupPrefs {
    let path = dir.join(PREFS_FILE_NAME);
    let Ok(bytes) = std::fs::read(path) else {
        return StartupPrefs::default();
    };
    serde_json::from_slice(&bytes).unwrap_or_default()
}

pub fn read_startup_prefs_early() -> StartupPrefs {
    let Some(dir) = resolve_early_app_data_dir() else {
        return StartupPrefs::default();
    };
    read_startup_prefs_from_dir(&dir)
}

pub fn write_startup_prefs(dir: &Path, new_instance_behavior: &str) -> Result<(), String> {
    let normalized = if new_instance_behavior == "new_window" {
        "new_window".to_string()
    } else {
        "attach".to_string()
    };
    std::fs::create_dir_all(dir).map_err(|e| format!("Failed to create app data dir: {e}"))?;
    let prefs = StartupPrefs {
        new_instance_behavior: normalized,
    };
    let json = serde_json::to_vec(&prefs).map_err(|e| format!("Failed to serialize startup prefs: {e}"))?;
    std::fs::write(dir.join(PREFS_FILE_NAME), json)
        .map_err(|e| format!("Failed to write startup prefs: {e}"))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_default_when_missing_and_round_trips_prefs() {
        let dir = tempfile::tempdir().expect("temp dir");
        assert_eq!(
            read_startup_prefs_from_dir(dir.path()),
            StartupPrefs {
                new_instance_behavior: "attach".to_string(),
            }
        );

        write_startup_prefs(dir.path(), "new_window").expect("write new_window");
        assert_eq!(
            read_startup_prefs_from_dir(dir.path()),
            StartupPrefs {
                new_instance_behavior: "new_window".to_string(),
            }
        );

        write_startup_prefs(dir.path(), "invalid_value").expect("normalize invalid value");
        assert_eq!(
            read_startup_prefs_from_dir(dir.path()),
            StartupPrefs {
                new_instance_behavior: "attach".to_string(),
            }
        );
    }
}

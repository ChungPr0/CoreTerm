use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use futures_util::StreamExt;
use semver::Version;
use serde::Deserialize;
use sha2::{Digest, Sha256};

use crate::core::defaults::{
    UPDATER_ALLOWED_ASSET_DOWNLOAD_PREFIX as ALLOWED_ASSET_DOWNLOAD_PREFIX,
    UPDATER_ALLOWED_RELEASE_HTML_PREFIX as ALLOWED_RELEASE_HTML_PREFIX,
    UPDATER_CHECKSUM_ASSET_NAME as CHECKSUM_ASSET_NAME,
    UPDATER_FALLBACK_RELEASES_PAGE as FALLBACK_RELEASES_PAGE,
    UPDATER_GITHUB_LATEST_RELEASE_API as GITHUB_LATEST_RELEASE_API,
    UPDATER_MAX_INSTALLER_BYTES as MAX_INSTALLER_BYTES,
};
use crate::core::error::CoreError;
use crate::infra::os::{detect_install_kind, InstallKind};
use crate::ipc::dto::{
    AppUpdateEnvDto, UpdateCheckResultDto, UpdateDownloadProgressDto, UpdateDownloadResultDto,
};

#[derive(Debug, Clone, Deserialize)]
pub(crate) struct GithubReleaseResponse {
    pub tag_name: String,
    #[serde(default)]
    pub draft: bool,
    #[serde(default)]
    pub prerelease: bool,
    #[serde(default)]
    pub html_url: String,
    #[serde(default)]
    pub body: Option<String>,
    #[serde(default)]
    pub published_at: Option<String>,
    #[serde(default)]
    pub assets: Vec<GithubReleaseAsset>,
}

#[derive(Debug, Clone, Deserialize)]
pub(crate) struct GithubReleaseAsset {
    pub name: String,
    pub browser_download_url: String,
    #[serde(default)]
    pub size: u64,
    #[serde(default)]
    pub digest: Option<String>,
}

#[derive(Debug, Clone)]
struct ResolvedUpdateCandidate {
    version: String,
    asset_name: Option<String>,
    asset_url: Option<String>,
    asset_size: Option<u64>,
    expected_sha256: Option<String>,
    staged_installer_path: Option<PathBuf>,
}

#[derive(Clone)]
pub struct UpdaterService {
    updates_dir: PathBuf,
    current_version: String,
    install_kind: InstallKind,
    latest: Arc<Mutex<Option<ResolvedUpdateCandidate>>>,
    downloading: Arc<AtomicBool>,
}

fn hex_encode_lower(bytes: &[u8]) -> String {
    const HEX: &[u8; 16] = b"0123456789abcdef";
    let mut out = String::with_capacity(bytes.len() * 2);
    for &b in bytes {
        out.push(HEX[(b >> 4) as usize] as char);
        out.push(HEX[(b & 0x0f) as usize] as char);
    }
    out
}

pub(crate) fn parse_stable_version(raw_tag: &str) -> Option<Version> {
    let trimmed = raw_tag.trim();
    if trimmed.is_empty() || trimmed.to_ascii_lowercase().contains("nightly") {
        return None;
    }
    let clean = trimmed
        .strip_prefix('v')
        .or_else(|| trimmed.strip_prefix('V'))
        .unwrap_or(trimmed);
    let parsed = Version::parse(clean).ok()?;
    // Strictly reject pre-release tags such as -alpha, -beta, -rc.
    if !parsed.pre.is_empty() {
        return None;
    }
    Some(parsed)
}

pub(crate) fn parse_sha256_digest_field(raw: Option<&str>) -> Option<String> {
    let text = raw?.trim();
    let hex_part = text
        .strip_prefix("sha256:")
        .or_else(|| text.strip_prefix("SHA256:"))
        .unwrap_or(text)
        .trim();
    if hex_part.len() == 64 && hex_part.bytes().all(|b| b.is_ascii_hexdigit()) {
        Some(hex_part.to_ascii_lowercase())
    } else {
        None
    }
}

pub(crate) fn parse_checksums_file(contents: &str, target_filename: &str) -> Option<String> {
    for line in contents.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() || trimmed.starts_with('#') {
            continue;
        }
        let mut parts = trimmed.split_whitespace();
        let Some(hash_str) = parts.next() else {
            continue;
        };
        let Some(name_raw) = parts.next() else {
            continue;
        };
        let file_name = name_raw.trim_start_matches('*');
        if file_name.eq_ignore_ascii_case(target_filename) {
            if let Some(valid) = parse_sha256_digest_field(Some(hash_str)) {
                return Some(valid);
            }
        }
    }
    None
}

pub(crate) fn sanitize_installer_filename(raw: &str, kind: InstallKind) -> Option<String> {
    let trimmed = raw.trim();
    if trimmed.is_empty()
        || trimmed.len() > 160
        || trimmed.contains('/')
        || trimmed.contains('\\')
        || trimmed.contains("..")
        || trimmed.bytes().any(|b| b < 0x20 || b == 0x7f)
    {
        return None;
    }
    let lower = trimmed.to_ascii_lowercase();
    match kind {
        InstallKind::Nsis if lower.ends_with(".exe") && !lower.contains("portable") => {
            Some(trimmed.to_string())
        }
        InstallKind::Msi if lower.ends_with(".msi") => Some(trimmed.to_string()),
        _ => None,
    }
}

pub(crate) fn select_asset_for_install_kind(
    assets: &[GithubReleaseAsset],
    kind: InstallKind,
) -> Option<&GithubReleaseAsset> {
    match kind {
        InstallKind::Nsis => assets.iter().find(|a| {
            let lower = a.name.to_ascii_lowercase();
            lower.ends_with("-setup.exe")
                || (lower.ends_with("setup.exe") && !lower.contains("portable"))
        }),
        InstallKind::Msi => assets
            .iter()
            .find(|a| a.name.to_ascii_lowercase().ends_with(".msi")),
        InstallKind::Portable | InstallKind::Dev => None,
    }
}

fn validate_release_html_url(raw: &str) -> String {
    let trimmed = raw.trim();
    if trimmed.starts_with(ALLOWED_RELEASE_HTML_PREFIX)
        && !trimmed
            .bytes()
            .any(|b| b <= 0x20 || b == 0x7f || b == b'"' || b == b'\\')
    {
        trimmed.to_string()
    } else {
        FALLBACK_RELEASES_PAGE.to_string()
    }
}

fn is_allowed_download_url(raw: &str) -> bool {
    let trimmed = raw.trim();
    trimmed.starts_with(ALLOWED_ASSET_DOWNLOAD_PREFIX)
        && !trimmed
            .bytes()
            .any(|b| b <= 0x20 || b == 0x7f || b == b'"' || b == b'\\')
}

fn compute_file_sha256(path: &Path) -> Result<String, CoreError> {
    use std::io::Read;
    let mut file = std::fs::File::open(path)?;
    let mut hasher = Sha256::new();
    let mut buf = [0u8; 64 * 1024];
    loop {
        let n = file.read(&mut buf)?;
        if n == 0 {
            break;
        }
        hasher.update(&buf[..n]);
    }
    Ok(hex_encode_lower(&hasher.finalize()))
}

fn build_http_client(timeout_secs: u64, current_version: &str) -> Result<reqwest::Client, CoreError> {
    reqwest::Client::builder()
        .user_agent(format!("CoreTerm/{current_version}"))
        .timeout(Duration::from_secs(timeout_secs))
        .connect_timeout(Duration::from_secs(10))
        .build()
        .map_err(|e| CoreError::Os(format!("Failed to initialize HTTPS client: {e}")))
}

impl UpdaterService {
    pub fn new(app_data_dir: &Path) -> Self {
        let updates_dir = app_data_dir.join("updates");
        let current_version = env!("CARGO_PKG_VERSION").to_string();
        let install_kind = detect_install_kind();
        let service = Self {
            updates_dir,
            current_version,
            install_kind,
            latest: Arc::new(Mutex::new(None)),
            downloading: Arc::new(AtomicBool::new(false)),
        };
        service.cleanup_stale_files();
        service
    }

    /// Removes partial `.part` downloads and installers that are older or equal to the running version.
    fn cleanup_stale_files(&self) {
        let Ok(entries) = std::fs::read_dir(&self.updates_dir) else {
            return;
        };
        let cur_ver = Version::parse(&self.current_version).ok();
        for entry in entries.flatten() {
            let path = entry.path();
            if !path.is_file() {
                continue;
            }
            let name = path
                .file_name()
                .unwrap_or_default()
                .to_string_lossy()
                .to_string();
            if name.ends_with(".part") {
                let _ = std::fs::remove_file(&path);
                continue;
            }
            if let Some(ref cur) = cur_ver {
                let dominated = extract_embedded_semver(&name).is_none_or(|v| v <= *cur);
                if dominated {
                    let _ = std::fs::remove_file(&path);
                }
            }
        }
    }

    pub fn get_env_info(&self) -> AppUpdateEnvDto {
        AppUpdateEnvDto {
            current_version: self.current_version.clone(),
            install_kind: self.install_kind,
            can_install_in_app: self.install_kind.can_install_in_app(),
            supports_silent_auto_download: self.install_kind.supports_silent_auto_download(),
        }
    }

    pub async fn check_for_update(&self) -> Result<UpdateCheckResultDto, CoreError> {
        let client = build_http_client(20, &self.current_version)?;
        let resp = client
            .get(GITHUB_LATEST_RELEASE_API)
            .header("Accept", "application/vnd.github+json")
            .send()
            .await
            .map_err(|e| CoreError::Os(format!("Failed to query release server: {e}")))?;

        if resp.status() == reqwest::StatusCode::NOT_FOUND {
            // Repository has no non-prerelease published yet.
            return Ok(self.empty_check_result());
        }
        if !resp.status().is_success() {
            return Err(CoreError::Os(format!(
                "Release server returned HTTP {}.",
                resp.status().as_u16()
            )));
        }

        let release: GithubReleaseResponse = resp
            .json()
            .await
            .map_err(|e| CoreError::Os(format!("Invalid release metadata format: {e}")))?;

        if release.draft || release.prerelease {
            return Ok(self.empty_check_result());
        }

        let Some(remote_ver) = parse_stable_version(&release.tag_name) else {
            return Ok(self.empty_check_result());
        };
        let current_ver = Version::parse(&self.current_version)
            .unwrap_or_else(|_| Version::new(0, 0, 0));
        if remote_ver <= current_ver {
            if let Ok(mut guard) = self.latest.lock() {
                *guard = None;
            }
            return Ok(self.empty_check_result());
        }

        let release_url = validate_release_html_url(&release.html_url);
        let selected_asset = select_asset_for_install_kind(&release.assets, self.install_kind);

        let mut asset_name: Option<String> = None;
        let mut asset_url: Option<String> = None;
        let mut asset_size: Option<u64> = None;
        let mut expected_sha256: Option<String> = None;
        let mut staged_path: Option<PathBuf> = None;

        if let Some(asset) = selected_asset {
            if let Some(safe_name) = sanitize_installer_filename(&asset.name, self.install_kind) {
                if is_allowed_download_url(&asset.browser_download_url)
                    && asset.size <= MAX_INSTALLER_BYTES
                {
                    let mut sha = parse_sha256_digest_field(asset.digest.as_deref());
                    if sha.is_none() {
                        sha = self
                            .fetch_checksum_from_release_asset(&client, &release.assets, &safe_name)
                            .await;
                    }
                    if let Some(ref valid_sha) = sha {
                        let candidate_path = self.updates_dir.join(&safe_name);
                        if candidate_path.is_file() {
                            if let Ok(actual_sha) = compute_file_sha256(&candidate_path) {
                                if actual_sha == *valid_sha {
                                    staged_path = Some(candidate_path);
                                } else {
                                    let _ = std::fs::remove_file(&candidate_path);
                                }
                            }
                        }
                        asset_name = Some(safe_name);
                        asset_url = Some(asset.browser_download_url.trim().to_string());
                        asset_size = Some(asset.size);
                        expected_sha256 = sha;
                    }
                }
            }
        }

        let can_install_in_app = self.install_kind.can_install_in_app()
            && asset_url.is_some()
            && expected_sha256.is_some();
        let is_downloaded = staged_path.is_some();
        let version_str = remote_ver.to_string();

        let release_notes = release
            .body
            .map(|b| b.trim().to_string())
            .filter(|b| !b.is_empty());

        let resolved = ResolvedUpdateCandidate {
            version: version_str.clone(),
            asset_name: asset_name.clone(),
            asset_url,
            asset_size,
            expected_sha256,
            staged_installer_path: staged_path,
        };

        let dto = UpdateCheckResultDto {
            available: true,
            current_version: self.current_version.clone(),
            install_kind: self.install_kind,
            version: Some(version_str),
            tag_name: Some(release.tag_name),
            release_notes,
            published_at: release.published_at,
            release_url: Some(release_url),
            asset_name,
            asset_size,
            can_install_in_app,
            is_downloaded,
        };

        if let Ok(mut guard) = self.latest.lock() {
            *guard = Some(resolved);
        }

        Ok(dto)
    }

    async fn fetch_checksum_from_release_asset(
        &self,
        client: &reqwest::Client,
        assets: &[GithubReleaseAsset],
        target_filename: &str,
    ) -> Option<String> {
        let sum_asset = assets
            .iter()
            .find(|a| a.name.eq_ignore_ascii_case(CHECKSUM_ASSET_NAME))?;
        if !is_allowed_download_url(&sum_asset.browser_download_url) || sum_asset.size > 64 * 1024 {
            return None;
        }
        let resp = client
            .get(sum_asset.browser_download_url.trim())
            .send()
            .await
            .ok()?;
        if !resp.status().is_success() {
            return None;
        }
        let body = resp.text().await.ok()?;
        parse_checksums_file(&body, target_filename)
    }

    pub async fn download_update<F>(&self, mut on_progress: F) -> Result<UpdateDownloadResultDto, CoreError>
    where
        F: FnMut(UpdateDownloadProgressDto),
    {
        if !self.install_kind.can_install_in_app() {
            return Err(CoreError::Validation(
                "In-app update download is only supported for installed builds.".to_string(),
            ));
        }

        let candidate = self
            .latest
            .lock()
            .ok()
            .and_then(|g| g.clone())
            .ok_or_else(|| CoreError::Validation("No pending update available to download.".to_string()))?;

        let (Some(asset_name), Some(asset_url), Some(expected_sha256)) = (
            candidate.asset_name.clone(),
            candidate.asset_url.clone(),
            candidate.expected_sha256.clone(),
        ) else {
            return Err(CoreError::Validation(
                "Update installer package or checksum is unavailable for this release.".to_string(),
            ));
        };

        let final_path = self.updates_dir.join(&asset_name);
        if final_path.is_file() {
            if let Ok(actual) = compute_file_sha256(&final_path) {
                if actual == expected_sha256 {
                    if let Ok(mut guard) = self.latest.lock() {
                        if let Some(ref mut cur) = *guard {
                            if cur.version == candidate.version {
                                cur.staged_installer_path = Some(final_path);
                            }
                        }
                    }
                    return Ok(UpdateDownloadResultDto {
                        version: candidate.version,
                        ready: true,
                    });
                }
            }
            let _ = std::fs::remove_file(&final_path);
        }

        if self
            .downloading
            .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
            .is_err()
        {
            return Err(CoreError::Validation(
                "Update download is already in progress.".to_string(),
            ));
        }

        struct DownloadGuard(Arc<AtomicBool>);
        impl Drop for DownloadGuard {
            fn drop(&mut self) {
                self.0.store(false, Ordering::SeqCst);
            }
        }
        let _guard = DownloadGuard(self.downloading.clone());

        std::fs::create_dir_all(&self.updates_dir)?;
        let part_path = self.updates_dir.join(format!("{asset_name}.part"));
        let _ = std::fs::remove_file(&part_path);

        let client = build_http_client(300, &self.current_version)?;
        let resp = client
            .get(&asset_url)
            .send()
            .await
            .map_err(|e| CoreError::Os(format!("Failed to download update installer: {e}")))?;

        if !resp.status().is_success() {
            return Err(CoreError::Os(format!(
                "Update download failed with HTTP {}.",
                resp.status().as_u16()
            )));
        }

        let total_bytes = resp
            .content_length()
            .or(candidate.asset_size)
            .unwrap_or(0);
        if total_bytes > MAX_INSTALLER_BYTES {
            return Err(CoreError::Validation(
                "Update installer exceeds maximum allowed size.".to_string(),
            ));
        }

        let mut file = tokio::fs::File::create(&part_path).await?;
        let mut stream = resp.bytes_stream();
        let mut hasher = Sha256::new();
        let mut downloaded_bytes: u64 = 0;
        let mut last_emitted_percent: u8 = 0;

        on_progress(UpdateDownloadProgressDto {
            downloaded_bytes: 0,
            total_bytes,
            percent: 0,
        });

        while let Some(chunk_res) = stream.next().await {
            let chunk = match chunk_res {
                Ok(c) => c,
                Err(e) => {
                    drop(file);
                    let _ = tokio::fs::remove_file(&part_path).await;
                    return Err(CoreError::Os(format!("Download interrupted: {e}")));
                }
            };
            downloaded_bytes = downloaded_bytes.saturating_add(chunk.len() as u64);
            if downloaded_bytes > MAX_INSTALLER_BYTES {
                drop(file);
                let _ = tokio::fs::remove_file(&part_path).await;
                return Err(CoreError::Validation(
                    "Update installer exceeds maximum allowed size.".to_string(),
                ));
            }
            hasher.update(&chunk);
            if let Err(e) = tokio::io::AsyncWriteExt::write_all(&mut file, &chunk).await {
                drop(file);
                let _ = tokio::fs::remove_file(&part_path).await;
                return Err(CoreError::Io(e));
            }

            if let Some(raw_pct) = downloaded_bytes.saturating_mul(100).checked_div(total_bytes) {
                let pct = raw_pct.min(100) as u8;
                if pct > last_emitted_percent {
                    last_emitted_percent = pct;
                    on_progress(UpdateDownloadProgressDto {
                        downloaded_bytes,
                        total_bytes,
                        percent: pct,
                    });
                }
            }
        }

        tokio::io::AsyncWriteExt::flush(&mut file).await?;
        drop(file);

        if let Some(expected_len) = candidate.asset_size.filter(|&s| s > 0) {
            if downloaded_bytes != expected_len {
                let _ = tokio::fs::remove_file(&part_path).await;
                return Err(CoreError::Validation(
                    "Update package checksum verification failed.".to_string(),
                ));
            }
        }

        let actual_sha256 = hex_encode_lower(&hasher.finalize());
        if actual_sha256 != expected_sha256 {
            let _ = tokio::fs::remove_file(&part_path).await;
            return Err(CoreError::Validation(
                "Update package checksum verification failed.".to_string(),
            ));
        }

        if final_path.exists() {
            let _ = tokio::fs::remove_file(&final_path).await;
        }
        tokio::fs::rename(&part_path, &final_path).await?;

        on_progress(UpdateDownloadProgressDto {
            downloaded_bytes,
            total_bytes: total_bytes.max(downloaded_bytes),
            percent: 100,
        });

        if let Ok(mut guard) = self.latest.lock() {
            if let Some(ref mut cur) = *guard {
                if cur.version == candidate.version {
                    cur.staged_installer_path = Some(final_path);
                }
            }
        }

        Ok(UpdateDownloadResultDto {
            version: candidate.version,
            ready: true,
        })
    }

    pub fn launch_staged_installer(&self) -> Result<(), CoreError> {
        if !self.install_kind.can_install_in_app() {
            return Err(CoreError::Validation(
                "In-app update installation is only supported for installed builds.".to_string(),
            ));
        }

        let candidate = self
            .latest
            .lock()
            .ok()
            .and_then(|g| g.clone())
            .ok_or_else(|| CoreError::Validation("No staged update installer found.".to_string()))?;

        let (Some(installer_path), Some(expected_sha256)) = (
            candidate.staged_installer_path,
            candidate.expected_sha256,
        ) else {
            return Err(CoreError::Validation(
                "No staged update installer found.".to_string(),
            ));
        };

        if !installer_path.is_file() {
            return Err(CoreError::Validation(
                "No staged update installer found.".to_string(),
            ));
        }

        // Re-verify SHA-256 right before spawning to prevent TOCTOU tampering on disk.
        let actual_sha256 = compute_file_sha256(&installer_path)?;
        if actual_sha256 != expected_sha256 {
            let _ = std::fs::remove_file(&installer_path);
            return Err(CoreError::Validation(
                "Update package checksum verification failed.".to_string(),
            ));
        }

        #[cfg(target_os = "windows")]
        {
            match self.install_kind {
                InstallKind::Nsis => {
                    std::process::Command::new(&installer_path)
                        .args(["/P", "/UPDATE", "/R"])
                        .spawn()
                        .map_err(|e| {
                            CoreError::Os(format!("Failed to launch NSIS update installer: {e}"))
                        })?;
                }
                InstallKind::Msi => {
                    let msiexec = crate::infra::os::system32_binary("msiexec.exe");
                    std::process::Command::new(msiexec)
                        .arg("/i")
                        .arg(&installer_path)
                        .arg("/passive")
                        .spawn()
                        .map_err(|e| {
                            CoreError::Os(format!("Failed to launch MSI update installer: {e}"))
                        })?;
                }
                InstallKind::Portable | InstallKind::Dev => {
                    return Err(CoreError::Validation(
                        "In-app update installation is only supported for installed builds."
                            .to_string(),
                    ));
                }
            }
            Ok(())
        }

        #[cfg(not(target_os = "windows"))]
        {
            Err(CoreError::Os(
                "Update installer launch is only supported on Windows.".to_string(),
            ))
        }
    }

    fn empty_check_result(&self) -> UpdateCheckResultDto {
        UpdateCheckResultDto {
            available: false,
            current_version: self.current_version.clone(),
            install_kind: self.install_kind,
            version: None,
            tag_name: None,
            release_notes: None,
            published_at: None,
            release_url: None,
            asset_name: None,
            asset_size: None,
            can_install_in_app: false,
            is_downloaded: false,
        }
    }
}

fn extract_embedded_semver(filename: &str) -> Option<Version> {
    for token in filename.split(['_', '-', ' ']) {
        let cleaned = token
            .trim_end_matches(".exe")
            .trim_end_matches(".msi")
            .trim_start_matches('v')
            .trim_start_matches('V');
        if let Ok(ver) = Version::parse(cleaned) {
            return Some(ver);
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_only_stable_release_tags_and_rejects_prereleases_or_nightly() {
        assert_eq!(parse_stable_version("v0.5.5"), Some(Version::new(0, 5, 5)));
        assert_eq!(parse_stable_version("1.2.0"), Some(Version::new(1, 2, 0)));
        assert_eq!(parse_stable_version("nightly"), None);
        assert_eq!(parse_stable_version("v0.6.0-beta.1"), None);
        assert_eq!(parse_stable_version("v1.0.0-rc.2"), None);
        assert_eq!(parse_stable_version(""), None);
    }

    #[test]
    fn parses_github_digest_and_sha256sums_manifest() {
        let valid = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
        assert_eq!(
            parse_sha256_digest_field(Some(&format!("sha256:{valid}"))),
            Some(valid.to_string())
        );
        assert_eq!(parse_sha256_digest_field(Some("sha256:short")), None);

        let manifest = format!(
            "{valid}  CoreTerm_0.6.0_x64-setup.exe\nffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff *CoreTerm_0.6.0_x64_en-US.msi\n"
        );
        assert_eq!(
            parse_checksums_file(&manifest, "CoreTerm_0.6.0_x64-setup.exe"),
            Some(valid.to_string())
        );
        assert_eq!(
            parse_checksums_file(&manifest, "CoreTerm_0.6.0_x64_en-US.msi"),
            Some("f".repeat(64))
        );
    }

    #[test]
    fn selects_and_sanitizes_installer_assets_per_install_kind() {
        let assets = vec![
            GithubReleaseAsset {
                name: "CoreTerm_x64_portable.exe".to_string(),
                browser_download_url:
                    "https://github.com/ChungPr0/CoreTerm/releases/download/v0.6.0/CoreTerm_x64_portable.exe"
                        .to_string(),
                size: 1000,
                digest: None,
            },
            GithubReleaseAsset {
                name: "CoreTerm_0.6.0_x64-setup.exe".to_string(),
                browser_download_url:
                    "https://github.com/ChungPr0/CoreTerm/releases/download/v0.6.0/CoreTerm_0.6.0_x64-setup.exe"
                        .to_string(),
                size: 2000,
                digest: None,
            },
            GithubReleaseAsset {
                name: "CoreTerm_0.6.0_x64_en-US.msi".to_string(),
                browser_download_url:
                    "https://github.com/ChungPr0/CoreTerm/releases/download/v0.6.0/CoreTerm_0.6.0_x64_en-US.msi"
                        .to_string(),
                size: 3000,
                digest: None,
            },
        ];

        assert_eq!(
            select_asset_for_install_kind(&assets, InstallKind::Nsis).map(|a| a.name.as_str()),
            Some("CoreTerm_0.6.0_x64-setup.exe")
        );
        assert_eq!(
            select_asset_for_install_kind(&assets, InstallKind::Msi).map(|a| a.name.as_str()),
            Some("CoreTerm_0.6.0_x64_en-US.msi")
        );
        assert!(select_asset_for_install_kind(&assets, InstallKind::Portable).is_none());

        assert_eq!(
            sanitize_installer_filename("CoreTerm_0.6.0_x64-setup.exe", InstallKind::Nsis),
            Some("CoreTerm_0.6.0_x64-setup.exe".to_string())
        );
        assert_eq!(
            sanitize_installer_filename("../evil-setup.exe", InstallKind::Nsis),
            None
        );
        assert_eq!(
            sanitize_installer_filename("CoreTerm_x64_portable.exe", InstallKind::Nsis),
            None
        );
    }
}

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};

use dashmap::DashMap;
use tauri::ipc::Channel;
use tauri::AppHandle;
use tracing::info;
use zeroize::Zeroizing;

use crate::core::error::{CoreError, CoreResult};
use crate::hosts::HostService;
use crate::infra::os::{is_process_elevated, JobObjectSupervisor};
use crate::infra::security::{TabSecretKind, TabSecretStore};
use crate::ipc::dto::{
    PortProbeResultDto, SessionConnectAckDto, SessionConnectRequestDto,
    SessionReconnectRequestDto, ShellProfile,
};
use crate::keys::KeyService;
use crate::ssh::ActiveTunnelRegistry;

use super::direct::DirectLaunchSpec;
use super::events::emit_status;
use super::shells::{
    default_shell_profile, detect_available_shells as scan_available_shells,
};
use super::ssh::prepare_ssh_launch;
use super::types::{InFlightConnectGuard, PrewarmedLocalSession, PtySession, StagedSecret};

#[derive(Clone)]
pub struct PtySessionManager {
    pub(super) sessions: Arc<DashMap<String, Arc<PtySession>>>,
    in_flight_connects: Arc<DashMap<String, Arc<AtomicBool>>>,
    tab_host_map: Arc<DashMap<String, String>>,
    tab_admin_map: Arc<DashMap<String, bool>>,
    tab_shell_map: Arc<DashMap<String, ShellProfile>>,
    pub(super) tab_secrets: TabSecretStore,
    pub(super) tunnel_registry: ActiveTunnelRegistry,
    pub(super) job_supervisor: JobObjectSupervisor,
    pub(super) prewarmed_local: Arc<Mutex<Option<PrewarmedLocalSession>>>,
    pub(super) prewarm_cancelled: Arc<AtomicBool>,
    cached_shells: Arc<tokio::sync::Mutex<Option<Vec<ShellProfile>>>>,
}

impl PtySessionManager {
    pub fn new(job_supervisor: JobObjectSupervisor, tab_secrets: TabSecretStore) -> Self {
        Self {
            sessions: Arc::new(DashMap::new()),
            in_flight_connects: Arc::new(DashMap::new()),
            tab_host_map: Arc::new(DashMap::new()),
            tab_admin_map: Arc::new(DashMap::new()),
            tab_shell_map: Arc::new(DashMap::new()),
            tab_secrets,
            tunnel_registry: ActiveTunnelRegistry::new(),
            job_supervisor,
            prewarmed_local: Arc::new(Mutex::new(None)),
            prewarm_cancelled: Arc::new(AtomicBool::new(false)),
            cached_shells: Arc::new(tokio::sync::Mutex::new(None)),
        }
    }

    pub fn has_tab(&self, tab_id: &str) -> bool {
        let trimmed = tab_id.trim();
        self.tab_host_map.contains_key(trimmed) || self.sessions.contains_key(trimmed)
    }

    pub async fn detect_available_shells(&self, refresh: bool) -> Vec<ShellProfile> {
        let mut guard = self.cached_shells.lock().await;
        if !refresh {
            if let Some(ref cached) = *guard {
                return cached.clone();
            }
        }
        let detected = scan_available_shells().await;
        *guard = Some(detected.clone());
        detected
    }

    fn fallback_shell(&self) -> CoreResult<ShellProfile> {
        Ok(default_shell_profile())
    }

    pub fn tunnel_registry(&self) -> &ActiveTunnelRegistry {
        &self.tunnel_registry
    }

    pub fn probe_host_ports(
        &self,
        hosts: &HostService,
        host_id: &str,
    ) -> CoreResult<Vec<PortProbeResultDto>> {
        let rules = hosts.list_port_forwards(host_id)?;
        Ok(self.tunnel_registry.probe_host_rules(host_id, &rules))
    }

    pub fn check_port_available(
        &self,
        bind_address: &str,
        bind_port: u16,
    ) -> PortProbeResultDto {
        self.tunnel_registry.check_single_port(bind_address, bind_port)
    }

    pub fn connect(
        &self,
        app: &AppHandle,
        hosts: &HostService,
        keys: &KeyService,
        req: SessionConnectRequestDto,
        on_output: Channel<Vec<u8>>,
    ) -> CoreResult<SessionConnectAckDto> {
        let (abort_flag, _connect_guard) = {
            use dashmap::mapref::entry::Entry;
            match self.in_flight_connects.entry(req.tab_id.clone()) {
                Entry::Occupied(_) => {
                    return Err(CoreError::Pty(
                        "Tab connection is already in progress".to_string(),
                    ));
                }
                Entry::Vacant(slot) => {
                    let flag = Arc::new(AtomicBool::new(false));
                    slot.insert(Arc::clone(&flag));
                    (
                        flag,
                        InFlightConnectGuard {
                            map: self.in_flight_connects.clone(),
                            tab_id: req.tab_id.clone(),
                        },
                    )
                }
            }
        };

        let tab_id = req.tab_id.clone();
        let res = self.connect_inner(app, hosts, keys, req, on_output);
        if abort_flag.load(Ordering::SeqCst) {
            let _ = self.terminate_active_session(&tab_id);
            self.cleanup_tab_metadata(&tab_id);
            return Err(CoreError::Pty("Tab connection was cancelled".to_string()));
        }
        res
    }

    fn connect_inner(
        &self,
        app: &AppHandle,
        hosts: &HostService,
        keys: &KeyService,
        req: SessionConnectRequestDto,
        on_output: Channel<Vec<u8>>,
    ) -> CoreResult<SessionConnectAckDto> {

        if self.sessions.contains_key(&req.tab_id) {
            let _ = self.disconnect_session_only(app, &req.tab_id);
        }

        if let Some(prev_host) = self
            .tab_host_map
            .insert(req.tab_id.clone(), req.host_id.clone())
        {
            if prev_host != req.host_id {
                self.tab_secrets.clear_tab(&req.tab_id);
            }
        }

        let is_local = req.host_id == "local";
        let app_elevated = is_process_elevated();
        let is_admin = is_local && (app_elevated || req.as_admin.unwrap_or(false));
        self.tab_admin_map.insert(req.tab_id.clone(), is_admin);

        let mut local_profile = if is_local {
            let profile = match req.shell_profile.clone() {
                Some(p) => p,
                None => match self.fallback_shell() {
                    Ok(p) => p,
                    Err(err) => {
                        emit_status(
                            app,
                            &req.tab_id,
                            &req.host_id,
                            "ERROR",
                            vec![],
                            Some(err.to_string()),
                        );
                        return Err(err);
                    }
                },
            };
            if profile.executable.trim().is_empty() || profile.name.trim().is_empty() {
                let err = CoreError::Validation(
                    "Shell profile name and executable cannot be empty".to_string(),
                );
                emit_status(
                    app,
                    &req.tab_id,
                    &req.host_id,
                    "ERROR",
                    vec![],
                    Some(err.to_string()),
                );
                return Err(err);
            }
            self.tab_shell_map
                .insert(req.tab_id.clone(), profile.clone());
            Some(profile)
        } else {
            self.tab_shell_map.remove(&req.tab_id);
            None
        };

        if is_admin {
            let mut profile = local_profile.unwrap_or_else(default_shell_profile);
            #[cfg(windows)]
            {
                let resolved_exe =
                    match crate::infra::os::elevated_pty::resolve_elevated_shell_executable(
                        &profile.executable,
                    ) {
                        Ok(path) => path,
                        Err(msg) => {
                            let err = CoreError::Validation(msg);
                            emit_status(
                                app,
                                &req.tab_id,
                                &req.host_id,
                                "ERROR",
                                vec![],
                                Some(err.to_string()),
                            );
                            return Err(err);
                        }
                    };
                if let Err(msg) = crate::infra::os::elevated_pty::validate_elevated_shell(
                    &resolved_exe,
                    &profile.args,
                ) {
                    let err = CoreError::Validation(msg);
                    emit_status(
                        app,
                        &req.tab_id,
                        &req.host_id,
                        "ERROR",
                        vec![],
                        Some(err.to_string()),
                    );
                    return Err(err);
                }
                profile.executable = resolved_exe;
            }
            self.tab_shell_map
                .insert(req.tab_id.clone(), profile.clone());
            if !app_elevated {
                return self.connect_elevated_local(app, req, &profile, on_output);
            }
            local_profile = Some(profile);
        }

        if let Some(ref profile) = local_profile {
            if req.initial_cwd.is_none() {
                if let Some(ack) =
                    self.try_claim_prewarmed_local(app, &req, profile, is_admin, &on_output)
                {
                    return Ok(ack);
                }
            }
        }

        let ssh_plan = if is_local {
            None
        } else {
            Some(prepare_ssh_launch(
                app,
                hosts,
                &self.tunnel_registry,
                &req.tab_id,
                &req.host_id,
                req.conflict_strategy.as_deref(),
            )?)
        };

        self.spawn_direct_session(
            app,
            hosts,
            keys,
            DirectLaunchSpec {
                req,
                is_local,
                is_admin,
                local_profile,
                ssh_plan,
            },
            on_output,
        )
    }

    pub fn write_stdin(&self, tab_id: &str, data: &[u8]) -> CoreResult<()> {
        let session = self
            .sessions
            .get(tab_id)
            .ok_or_else(|| {
                CoreError::NotFound(format!("Active PTY session not found for tab {tab_id}"))
            })?
            .clone();

        if data.contains(&0x03) {
            session.cancel_pending_askpass();
        }
        session.write_bytes(data)
    }

    pub fn submit_secret(
        &self,
        _hosts: &HostService,
        _keys: &KeyService,
        tab_id: &str,
        secret: String,
        save_to_vault: bool,
        auto_reconnect: Option<bool>,
    ) -> CoreResult<()> {
        let zeroized_secret = Zeroizing::new(secret);
        let session = self
            .sessions
            .get(tab_id)
            .ok_or_else(|| {
                CoreError::NotFound(format!("Active PTY session not found for tab {tab_id}"))
            })?
            .clone();

        let Some((prompt_type, is_reusable)) =
            session.deliver_askpass_secret(zeroized_secret.clone())
        else {
            return Err(CoreError::NotFound(
                "No pending SSH authentication prompt".to_string(),
            ));
        };

        if is_reusable {
            let secret_kind = TabSecretKind::from_prompt_type(&prompt_type);
            session.stage_secret(StagedSecret {
                kind: secret_kind,
                secret: zeroized_secret,
                save_to_vault,
                auto_reconnect,
            });
        }

        Ok(())
    }

    pub fn submit_host_key(
        &self,
        app: &AppHandle,
        hosts: &HostService,
        tab_id: &str,
        action: &str,
    ) -> CoreResult<()> {
        match action {
            "ACCEPT" => {
                if let Some(session) = self.sessions.get(tab_id) {
                    if session.deliver_askpass_host_key(Some("yes".to_string())) {
                        return Ok(());
                    }
                }
                self.write_stdin(tab_id, b"yes\r\n")
            }
            "REJECT" => {
                if let Some(session) = self.sessions.get(tab_id) {
                    let _ = session.deliver_askpass_host_key(Some("no".to_string()));
                }
                let _ = self.write_stdin(tab_id, b"no\r\n");
                let _ = self.disconnect_session_only(app, tab_id);
                Ok(())
            }
            "REMOVE_OLD_AND_ACCEPT" => {
                let host_id = self
                    .tab_host_map
                    .get(tab_id)
                    .map(|v| v.value().clone())
                    .or_else(|| self.sessions.get(tab_id).map(|s| s.host_id.clone()))
                    .ok_or_else(|| {
                        CoreError::NotFound(format!("No host found for tab {tab_id}"))
                    })?;

                let config = hosts.get_detail(&host_id)?;
                crate::ssh::known_hosts::remove_host_from_known_hosts(&config.host, config.port);
                Ok(())
            }
            other => Err(CoreError::Validation(format!(
                "Unsupported host key action: {other}"
            ))),
        }
    }

    pub fn resize_pty(&self, tab_id: &str, cols: u16, rows: u16) -> CoreResult<()> {
        if cols == 0 || rows == 0 {
            return Ok(());
        }

        let Some(session_entry) = self.sessions.get(tab_id) else {
            return Ok(());
        };
        let session = session_entry.clone();
        session.resize(cols, rows)
    }

    pub fn reconnect(
        &self,
        app: &AppHandle,
        hosts: &HostService,
        keys: &KeyService,
        req: SessionReconnectRequestDto,
        on_output: Channel<Vec<u8>>,
    ) -> CoreResult<SessionConnectAckDto> {
        let tab_id = req.tab_id;
        let host_id = req
            .host_id
            .or_else(|| self.tab_host_map.get(&tab_id).map(|v| v.value().clone()))
            .or_else(|| self.sessions.get(&tab_id).map(|s| s.host_id.clone()))
            .ok_or_else(|| {
                CoreError::NotFound(format!(
                    "Cannot reconnect tab {tab_id}: no associated host_id found"
                ))
            })?;

        let remembered_admin = req
            .as_admin
            .or_else(|| self.tab_admin_map.get(&tab_id).map(|v| *v.value()))
            .or_else(|| self.sessions.get(&tab_id).map(|s| s.is_admin));

        let remembered_shell = req
            .shell_profile
            .or_else(|| self.tab_shell_map.get(&tab_id).map(|v| v.value().clone()));

        let _ = self.terminate_active_session(&tab_id);
        std::thread::sleep(std::time::Duration::from_millis(50));
        self.connect(
            app,
            hosts,
            keys,
            SessionConnectRequestDto {
                tab_id,
                host_id,
                cols: req.cols,
                rows: req.rows,
                conflict_strategy: None,
                as_admin: remembered_admin,
                shell_profile: remembered_shell,
                initial_cwd: None,
            },
            on_output,
        )
    }

    fn terminate_active_session(&self, tab_id: &str) -> Option<Arc<PtySession>> {
        self.tunnel_registry.release_tab_tunnels(tab_id);
        let (_, session) = self.sessions.remove(tab_id)?;
        session.manual_disconnect.store(true, Ordering::SeqCst);
        session.terminate();
        Some(session)
    }

    fn cleanup_tab_metadata(&self, tab_id: &str) {
        self.tab_host_map.remove(tab_id);
        self.tab_admin_map.remove(tab_id);
        self.tab_shell_map.remove(tab_id);
        self.tab_secrets.clear_tab(tab_id);
    }

    fn disconnect_session_only(&self, app: &AppHandle, tab_id: &str) -> CoreResult<()> {
        if let Some(session) = self.terminate_active_session(tab_id) {
            emit_status(
                app,
                &session.tab_id(),
                &session.host_id,
                "DISCONNECTED",
                vec![],
                None,
            );
        }
        Ok(())
    }

    fn mark_in_flight_aborted(&self, tab_id: &str) {
        if let Some(flag) = self.in_flight_connects.get(tab_id) {
            flag.store(true, Ordering::SeqCst);
        }
    }

    pub fn disconnect(&self, app: &AppHandle, tab_id: &str) -> CoreResult<()> {
        self.mark_in_flight_aborted(tab_id);
        self.disconnect_session_only(app, tab_id)?;
        self.cleanup_tab_metadata(tab_id);
        Ok(())
    }

    pub fn shutdown_all(&self) {
        self.prewarm_cancelled.store(true, Ordering::SeqCst);
        for entry in self.in_flight_connects.iter() {
            entry.value().store(true, Ordering::SeqCst);
        }
        if let Ok(mut guard) = self.prewarmed_local.lock() {
            if let Some(prewarmed) = guard.take() {
                prewarmed
                    .session
                    .manual_disconnect
                    .store(true, Ordering::SeqCst);
                prewarmed.session.terminate();
            }
        }
        let keys: Vec<String> = self.sessions.iter().map(|e| e.key().clone()).collect();
        for tab_id in keys {
            let _ = self.terminate_active_session(&tab_id);
            self.cleanup_tab_metadata(&tab_id);
        }
        self.tab_secrets.clear_all();
        info!("All ConPTY sessions shut down.");
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cleanup_tab_metadata_clears_all_tracking_maps() {
        let tab_secrets = TabSecretStore::new();
        let mgr = PtySessionManager::new(
            JobObjectSupervisor::new().expect("job supervisor"),
            tab_secrets.clone(),
        );
        mgr.tab_host_map.insert("tab-1".into(), "host-1".into());
        mgr.tab_admin_map.insert("tab-1".into(), true);
        mgr.tab_shell_map
            .insert("tab-1".into(), default_shell_profile());
        tab_secrets.set(
            "tab-1",
            "host-1",
            TabSecretKind::Password,
            Zeroizing::new("pw".into()),
        );
        assert!(mgr.has_tab("tab-1"));

        mgr.cleanup_tab_metadata("tab-1");

        assert!(!mgr.has_tab("tab-1"));
        assert!(mgr.tab_host_map.is_empty());
        assert!(mgr.tab_admin_map.is_empty());
        assert!(mgr.tab_shell_map.is_empty());
        assert!(tab_secrets
            .get("tab-1", "host-1", TabSecretKind::Password)
            .is_none());
    }

    #[test]
    fn mark_in_flight_aborted_flags_active_connect() {
        let mgr = PtySessionManager::new(
            JobObjectSupervisor::new().expect("job supervisor"),
            TabSecretStore::new(),
        );
        let flag = Arc::new(AtomicBool::new(false));
        mgr.in_flight_connects
            .insert("tab-race".into(), Arc::clone(&flag));

        mgr.mark_in_flight_aborted("tab-race");
        assert!(flag.load(Ordering::SeqCst));
    }
}

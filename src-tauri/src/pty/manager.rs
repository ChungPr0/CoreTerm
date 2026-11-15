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
use crate::ipc::dto::{
    PortProbeResultDto, SessionConnectAckDto, SessionConnectRequestDto,
    SessionReconnectRequestDto,
};
use crate::keys::KeyService;
use crate::ssh::ActiveTunnelRegistry;
use crate::telemetry::TelemetryHub;

use super::direct::DirectLaunchSpec;
use super::events::emit_status;
use super::ssh::prepare_ssh_launch;
use super::types::{InFlightConnectGuard, PrewarmedLocalSession, PtySession};

#[derive(Clone)]
pub struct PtySessionManager {
    pub(super) sessions: Arc<DashMap<String, Arc<PtySession>>>,
    in_flight_connects: Arc<DashMap<String, ()>>,
    tab_host_map: Arc<DashMap<String, String>>,
    tab_admin_map: Arc<DashMap<String, bool>>,
    pub(super) tunnel_registry: ActiveTunnelRegistry,
    pub(super) telemetry_hub: TelemetryHub,
    pub(super) job_supervisor: JobObjectSupervisor,
    pub(super) prewarmed_local: Arc<Mutex<Option<PrewarmedLocalSession>>>,
    pub(super) prewarm_cancelled: Arc<AtomicBool>,
}

impl PtySessionManager {
    pub fn new(job_supervisor: JobObjectSupervisor) -> Self {
        Self {
            sessions: Arc::new(DashMap::new()),
            in_flight_connects: Arc::new(DashMap::new()),
            tab_host_map: Arc::new(DashMap::new()),
            tab_admin_map: Arc::new(DashMap::new()),
            tunnel_registry: ActiveTunnelRegistry::new(),
            telemetry_hub: TelemetryHub::new(job_supervisor.clone()),
            job_supervisor,
            prewarmed_local: Arc::new(Mutex::new(None)),
            prewarm_cancelled: Arc::new(AtomicBool::new(false)),
        }
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

    pub fn connect(
        &self,
        app: &AppHandle,
        hosts: &HostService,
        keys: &KeyService,
        req: SessionConnectRequestDto,
        on_output: Channel<Vec<u8>>,
    ) -> CoreResult<SessionConnectAckDto> {
        let _connect_guard = {
            use dashmap::mapref::entry::Entry;
            match self.in_flight_connects.entry(req.tab_id.clone()) {
                Entry::Occupied(_) => {
                    return Err(CoreError::Pty(
                        "Tab connection is already in progress".to_string(),
                    ));
                }
                Entry::Vacant(slot) => {
                    slot.insert(());
                    InFlightConnectGuard {
                        map: self.in_flight_connects.clone(),
                        tab_id: req.tab_id.clone(),
                    }
                }
            }
        };

        if self.sessions.contains_key(&req.tab_id) {
            let _ = self.disconnect(app, &req.tab_id);
        }

        self.tab_host_map
            .insert(req.tab_id.clone(), req.host_id.clone());

        let is_local = req.host_id == "local";
        let app_elevated = is_process_elevated();
        let is_admin = is_local && (app_elevated || req.as_admin.unwrap_or(false));
        self.tab_admin_map.insert(req.tab_id.clone(), is_admin);

        // When parent app is unelevated and user asks for an Admin terminal tab, use UAC helper bridge.
        if is_admin && !app_elevated {
            return self.connect_elevated_local(app, hosts, req, on_output);
        }

        if is_local {
            if let Some(ack) =
                self.try_claim_prewarmed_local(app, hosts, &req, is_admin, &on_output)
            {
                return Ok(ack);
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

        session.write_bytes(data)
    }

    pub fn submit_secret(
        &self,
        hosts: &HostService,
        keys: &KeyService,
        tab_id: &str,
        secret: String,
        save_to_vault: bool,
    ) -> CoreResult<()> {
        let zeroized_secret = Zeroizing::new(secret);
        let session = self
            .sessions
            .get(tab_id)
            .ok_or_else(|| {
                CoreError::NotFound(format!("Active PTY session not found for tab {tab_id}"))
            })?
            .clone();

        let prompt_type = session
            .pending_prompt_type
            .lock()
            .ok()
            .and_then(|mut g| g.take())
            .unwrap_or_else(|| "PASSWORD".to_string());

        if save_to_vault {
            if prompt_type == "KEY_PASSPHRASE" {
                if let Some(ref key_id) = session.ssh_key_id {
                    let _ = keys.save_secret(key_id, &zeroized_secret);
                }
            } else {
                let _ = hosts.save_secret(&session.host_id, &zeroized_secret);
            }
        }

        let line = Zeroizing::new(format!("{}\r\n", zeroized_secret.as_str()));
        session.write_bytes(line.as_bytes())
    }

    /// Handles host key verification (`ACCEPT`, `REJECT`, or `REMOVE_OLD_AND_ACCEPT` via `ssh-keygen -R`).
    pub fn submit_host_key(
        &self,
        app: &AppHandle,
        hosts: &HostService,
        tab_id: &str,
        action: &str,
    ) -> CoreResult<()> {
        match action {
            "ACCEPT" => self.write_stdin(tab_id, b"yes\r\n"),
            "REJECT" => {
                let _ = self.write_stdin(tab_id, b"no\r\n");
                let _ = self.disconnect(app, tab_id);
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

        let _ = self.disconnect(app, &tab_id);
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
            },
            on_output,
        )
    }

    pub fn disconnect(&self, app: &AppHandle, tab_id: &str) -> CoreResult<()> {
        self.tunnel_registry.release_tab_tunnels(tab_id);
        self.telemetry_hub.release_tab(tab_id);

        if let Some((_, session)) = self.sessions.remove(tab_id) {
            session.manual_disconnect.store(true, Ordering::SeqCst);
            session.terminate();
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

    fn sync_telemetry_for_host(
        &self,
        app: &AppHandle,
        hosts: &HostService,
        host_id: &str,
        enabled: bool,
    ) {
        let active_tabs: Vec<String> = self
            .sessions
            .iter()
            .filter(|entry| entry.value().host_id == host_id)
            .map(|entry| entry.key().clone())
            .collect();

        for tab_id in active_tabs {
            if enabled {
                self.telemetry_hub.register_tab(app, hosts, host_id, &tab_id);
            } else {
                self.telemetry_hub.release_tab(&tab_id);
            }
        }
    }

    pub fn sync_host_telemetry(&self, app: &AppHandle, hosts: &HostService, host_id: &str) {
        let enabled = hosts
            .get_detail(host_id)
            .map(|c| c.options.telemetry_enabled)
            .unwrap_or(false);
        self.sync_telemetry_for_host(app, hosts, host_id, enabled);
    }

    pub fn sync_local_telemetry(
        &self,
        app: &AppHandle,
        hosts: &HostService,
        enabled: bool,
        interval_sec: u16,
    ) {
        self.telemetry_hub.set_local_config(enabled, interval_sec);
        self.sync_telemetry_for_host(app, hosts, "local", enabled);
    }

    pub fn shutdown_all(&self) {
        self.prewarm_cancelled.store(true, Ordering::SeqCst);
        if let Ok(mut guard) = self.prewarmed_local.lock() {
            if let Some(prewarmed) = guard.take() {
                prewarmed
                    .session
                    .manual_disconnect
                    .store(true, Ordering::SeqCst);
                prewarmed.session.terminate();
            }
        }
        self.telemetry_hub.shutdown_all();
        let keys: Vec<String> = self.sessions.iter().map(|e| e.key().clone()).collect();
        for tab_id in keys {
            self.tunnel_registry.release_tab_tunnels(&tab_id);
            if let Some((_, session)) = self.sessions.remove(&tab_id) {
                session.manual_disconnect.store(true, Ordering::SeqCst);
                session.terminate();
            }
        }
        info!("All ConPTY sessions and telemetry workers shut down.");
    }
}

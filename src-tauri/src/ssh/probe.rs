use std::collections::HashSet;
use std::net::TcpListener;
use std::process::Command;
use std::sync::Arc;

use dashmap::DashMap;

#[cfg(windows)]
use std::os::windows::process::CommandExt;

#[cfg(windows)]
use crate::infra::os::CREATE_NO_WINDOW;
use crate::ipc::dto::{PortForwardRuleDto, PortForwardStatusDto, PortProbeResultDto};

#[derive(Debug, Clone)]
pub struct ActiveTunnelOwner {
    pub tab_id: String,
    pub host_id: String,
    pub rule_id: String,
}

#[derive(Clone, Default)]
pub struct ActiveTunnelRegistry {
    tunnels: Arc<DashMap<(String, u16), ActiveTunnelOwner>>,
}

impl ActiveTunnelRegistry {
    pub fn new() -> Self {
        Self {
            tunnels: Arc::new(DashMap::new()),
        }
    }

    pub fn register_tunnel(
        &self,
        bind_address: &str,
        bind_port: u16,
        tab_id: &str,
        host_id: &str,
        rule_id: &str,
    ) {
        let key = (Self::normalize_addr(bind_address), bind_port);
        self.tunnels.insert(
            key,
            ActiveTunnelOwner {
                tab_id: tab_id.to_string(),
                host_id: host_id.to_string(),
                rule_id: rule_id.to_string(),
            },
        );
    }

    pub fn release_tab_tunnels(&self, tab_id: &str) {
        self.tunnels.retain(|_, owner| owner.tab_id != tab_id);
    }

    pub fn find_same_host_owner(
        &self,
        bind_address: &str,
        bind_port: u16,
        host_id: &str,
    ) -> Option<ActiveTunnelOwner> {
        let key = (Self::normalize_addr(bind_address), bind_port);
        self.tunnels
            .get(&key)
            .filter(|entry| entry.host_id == host_id)
            .map(|entry| entry.value().clone())
    }

    pub fn shared_rule_ids_for_host(
        &self,
        host_id: &str,
        rules: &[PortForwardRuleDto],
    ) -> HashSet<String> {
        let mut shared = HashSet::new();
        for r in rules.iter().filter(|r| r.is_enabled) {
            if (r.forward_type == "LOCAL" || r.forward_type == "DYNAMIC")
                && self
                    .find_same_host_owner(&r.bind_address, r.bind_port, host_id)
                    .is_some()
            {
                shared.insert(r.id.clone());
            }
        }
        shared
    }

    /// Probes enabled LOCAL and DYNAMIC rules for port availability or tunnel sharing.
    pub fn probe_host_rules(
        &self,
        host_id: &str,
        rules: &[PortForwardRuleDto],
    ) -> Vec<PortProbeResultDto> {
        let mut results = Vec::new();

        for rule in rules.iter().filter(|r| r.is_enabled) {
            if rule.forward_type != "LOCAL" && rule.forward_type != "DYNAMIC" {
                continue;
            }

            if let Some(owner) =
                self.find_same_host_owner(&rule.bind_address, rule.bind_port, host_id)
            {
                results.push(PortProbeResultDto {
                    rule_id: rule.id.clone(),
                    bind_address: rule.bind_address.clone(),
                    bind_port: rule.bind_port,
                    status: "SHARED_WITH_ACTIVE_TAB".to_string(),
                    owner_tab_id: Some(owner.tab_id),
                    conflicting_pid: None,
                    conflicting_process_name: None,
                });
                continue;
            }

            let bind_target = format!("{}:{}", rule.bind_address, rule.bind_port);
            let mut bind_attempt = TcpListener::bind(&bind_target);
            if bind_attempt.is_err() {
                for _ in 0..3 {
                    std::thread::sleep(std::time::Duration::from_millis(40));
                    bind_attempt = TcpListener::bind(&bind_target);
                    if bind_attempt.is_ok() {
                        break;
                    }
                }
            }

            match bind_attempt {
                Ok(listener) => {
                    drop(listener);
                    results.push(PortProbeResultDto {
                        rule_id: rule.id.clone(),
                        bind_address: rule.bind_address.clone(),
                        bind_port: rule.bind_port,
                        status: "AVAILABLE".to_string(),
                        owner_tab_id: None,
                        conflicting_pid: None,
                        conflicting_process_name: None,
                    });
                }
                Err(_) => {
                    let (pid, proc_name) = inspect_port_owner_process(rule.bind_port);
                    results.push(PortProbeResultDto {
                        rule_id: rule.id.clone(),
                        bind_address: rule.bind_address.clone(),
                        bind_port: rule.bind_port,
                        status: "CONFLICT_EXTERNAL".to_string(),
                        owner_tab_id: None,
                        conflicting_pid: pid,
                        conflicting_process_name: proc_name,
                    });
                }
            }
        }

        results
    }

    pub fn build_session_forward_statuses(
        &self,
        tab_id: &str,
        host_id: &str,
        rules: &[PortForwardRuleDto],
        skipped_rule_ids: &HashSet<String>,
    ) -> Vec<PortForwardStatusDto> {
        let mut statuses = Vec::new();
        for pf in rules.iter().filter(|r| r.is_enabled) {
            if pf.forward_type == "LOCAL" || pf.forward_type == "DYNAMIC" {
                if let Some(owner) =
                    self.find_same_host_owner(&pf.bind_address, pf.bind_port, host_id)
                {
                    if owner.tab_id != tab_id {
                        statuses.push(PortForwardStatusDto {
                            rule_id: pf.id.clone(),
                            bind_address: pf.bind_address.clone(),
                            bind_port: pf.bind_port,
                            forward_type: pf.forward_type.clone(),
                            status: "SHARED_WITH_ACTIVE_TAB".to_string(),
                            owner_tab_id: Some(owner.tab_id),
                        });
                        continue;
                    }
                }

                if skipped_rule_ids.contains(&pf.id) {
                    statuses.push(PortForwardStatusDto {
                        rule_id: pf.id.clone(),
                        bind_address: pf.bind_address.clone(),
                        bind_port: pf.bind_port,
                        forward_type: pf.forward_type.clone(),
                        status: "SKIPPED_CONFLICT".to_string(),
                        owner_tab_id: None,
                    });
                    continue;
                }

                self.register_tunnel(&pf.bind_address, pf.bind_port, tab_id, host_id, &pf.id);
            }

            statuses.push(PortForwardStatusDto {
                rule_id: pf.id.clone(),
                bind_address: pf.bind_address.clone(),
                bind_port: pf.bind_port,
                forward_type: pf.forward_type.clone(),
                status: "ACTIVE".to_string(),
                owner_tab_id: Some(tab_id.to_string()),
            });
        }
        statuses
    }

    pub fn check_single_port(&self, bind_address: &str, bind_port: u16) -> PortProbeResultDto {
        if bind_port == 0 {
            return PortProbeResultDto {
                rule_id: String::new(),
                bind_address: bind_address.to_string(),
                bind_port,
                status: "INVALID_PORT".to_string(),
                owner_tab_id: None,
                conflicting_pid: None,
                conflicting_process_name: None,
            };
        }

        let norm_addr = match crate::infra::db::port_forward_repo::validate_and_normalize_bind_address(bind_address) {
            Ok(addr) => {
                let trimmed = addr.trim();
                if trimmed.is_empty() || trimmed == "localhost" {
                    "127.0.0.1".to_string()
                } else {
                    trimmed.to_string()
                }
            }
            Err(_) => {
                return PortProbeResultDto {
                    rule_id: String::new(),
                    bind_address: bind_address.to_string(),
                    bind_port,
                    status: "INVALID_ADDRESS".to_string(),
                    owner_tab_id: None,
                    conflicting_pid: None,
                    conflicting_process_name: None,
                };
            }
        };

        let key = (norm_addr.clone(), bind_port);
        if let Some(entry) = self.tunnels.get(&key) {
            return PortProbeResultDto {
                rule_id: entry.rule_id.clone(),
                bind_address: bind_address.to_string(),
                bind_port,
                status: "SHARED_WITH_ACTIVE_TAB".to_string(),
                owner_tab_id: Some(entry.tab_id.clone()),
                conflicting_pid: None,
                conflicting_process_name: None,
            };
        }
        let wildcard_key = ("0.0.0.0".to_string(), bind_port);
        if let Some(entry) = self.tunnels.get(&wildcard_key) {
            return PortProbeResultDto {
                rule_id: entry.rule_id.clone(),
                bind_address: bind_address.to_string(),
                bind_port,
                status: "SHARED_WITH_ACTIVE_TAB".to_string(),
                owner_tab_id: Some(entry.tab_id.clone()),
                conflicting_pid: None,
                conflicting_process_name: None,
            };
        }

        let bind_target = format!("{norm_addr}:{bind_port}");
        match TcpListener::bind(&bind_target) {
            Ok(listener) => {
                drop(listener);
                PortProbeResultDto {
                    rule_id: String::new(),
                    bind_address: bind_address.to_string(),
                    bind_port,
                    status: "AVAILABLE".to_string(),
                    owner_tab_id: None,
                    conflicting_pid: None,
                    conflicting_process_name: None,
                }
            }
            Err(e) => {
                let (pid, proc_name) = inspect_port_owner_process(bind_port);
                if pid.is_some() {
                    PortProbeResultDto {
                        rule_id: String::new(),
                        bind_address: bind_address.to_string(),
                        bind_port,
                        status: "CONFLICT_EXTERNAL".to_string(),
                        owner_tab_id: None,
                        conflicting_pid: pid,
                        conflicting_process_name: proc_name,
                    }
                } else if e.kind() == std::io::ErrorKind::AddrNotAvailable {
                    PortProbeResultDto {
                        rule_id: String::new(),
                        bind_address: bind_address.to_string(),
                        bind_port,
                        status: "ADDR_NOT_AVAILABLE".to_string(),
                        owner_tab_id: None,
                        conflicting_pid: None,
                        conflicting_process_name: None,
                    }
                } else if e.kind() == std::io::ErrorKind::PermissionDenied && bind_port < 1024 {
                    PortProbeResultDto {
                        rule_id: String::new(),
                        bind_address: bind_address.to_string(),
                        bind_port,
                        status: "PERMISSION_DENIED".to_string(),
                        owner_tab_id: None,
                        conflicting_pid: None,
                        conflicting_process_name: None,
                    }
                } else if e.kind() == std::io::ErrorKind::AddrInUse {
                    PortProbeResultDto {
                        rule_id: String::new(),
                        bind_address: bind_address.to_string(),
                        bind_port,
                        status: "CONFLICT_EXTERNAL".to_string(),
                        owner_tab_id: None,
                        conflicting_pid: None,
                        conflicting_process_name: None,
                    }
                } else {
                    PortProbeResultDto {
                        rule_id: String::new(),
                        bind_address: bind_address.to_string(),
                        bind_port,
                        status: "BIND_FAILED".to_string(),
                        owner_tab_id: None,
                        conflicting_pid: None,
                        conflicting_process_name: None,
                    }
                }
            }
        }
    }

    fn normalize_addr(addr: &str) -> String {
        let trimmed = addr.trim();
        if trimmed.is_empty() || trimmed == "localhost" {
            "127.0.0.1".to_string()
        } else {
            trimmed.to_string()
        }
    }
}

fn inspect_port_owner_process(port: u16) -> (Option<u32>, Option<String>) {
    let mut cmd = Command::new("netstat");
    cmd.args(["-ano", "-p", "tcp"]);
    #[cfg(windows)]
    cmd.creation_flags(CREATE_NO_WINDOW);

    let Ok(output) = cmd.output() else {
        return (None, None);
    };

    let text = String::from_utf8_lossy(&output.stdout);
    let mut found_pid: Option<u32> = None;

    for line in text.lines() {
        if !line.contains("LISTENING") {
            continue;
        }
        let parts: Vec<&str> = line.split_whitespace().collect();
        if parts.len() >= 5 {
            if let Some(port_str) = parts[1].rsplit(':').next() {
                if let Ok(p) = port_str.parse::<u16>() {
                    if p == port {
                        if let Ok(pid) = parts[4].parse::<u32>() {
                            found_pid = Some(pid);
                            break;
                        }
                    }
                }
            }
        }
    }

    let Some(pid) = found_pid else {
        return (None, None);
    };

    let mut tcmd = Command::new("tasklist");
    tcmd.args(["/FI", &format!("PID eq {pid}"), "/FO", "CSV", "/NH"]);
    #[cfg(windows)]
    tcmd.creation_flags(CREATE_NO_WINDOW);

    let proc_name = tcmd.output().ok().and_then(|out| {
        let line = String::from_utf8_lossy(&out.stdout);
        let first = line.lines().next()?.trim();
        if first.starts_with('"') {
            first
                .split(',')
                .next()
                .map(|s| s.trim_matches('"').to_string())
        } else {
            None
        }
    });

    (Some(pid), proc_name)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_check_single_port_invalid_zero() {
        let registry = ActiveTunnelRegistry::new();
        let res = registry.check_single_port("127.0.0.1", 0);
        assert_eq!(res.status, "INVALID_PORT");
    }

    #[test]
    fn test_check_single_port_shared_with_active_tab() {
        let registry = ActiveTunnelRegistry::new();
        registry.register_tunnel("127.0.0.1", 19876, "tab-1", "host-1", "rule-1");

        let res = registry.check_single_port("127.0.0.1", 19876);
        assert_eq!(res.status, "SHARED_WITH_ACTIVE_TAB");
        assert_eq!(res.owner_tab_id, Some("tab-1".to_string()));

        let res_localhost = registry.check_single_port("localhost", 19876);
        assert_eq!(res_localhost.status, "SHARED_WITH_ACTIVE_TAB");
    }

    #[test]
    fn test_check_single_port_available_or_external_conflict() {
        let registry = ActiveTunnelRegistry::new();
        let listener = TcpListener::bind("127.0.0.1:0").expect("bind free port");
        let assigned_port = listener.local_addr().unwrap().port();

        let conflict_res = registry.check_single_port("127.0.0.1", assigned_port);
        assert_eq!(conflict_res.status, "CONFLICT_EXTERNAL");

        drop(listener);
        let avail_res = registry.check_single_port("127.0.0.1", assigned_port);
        assert_eq!(avail_res.status, "AVAILABLE");
    }
}

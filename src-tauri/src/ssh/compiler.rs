use std::collections::HashSet;
use std::ffi::OsString;

use crate::core::error::{CoreError, CoreResult};
use crate::ipc::dto::HostFullConfigDto;

use super::arg_builder::{
    push_base_target_args, push_key_identity_args, push_strict_host_key_arg, validate_host_target,
};

pub struct SshCommandCompiler;

impl SshCommandCompiler {
    pub fn compile_args(config: &HostFullConfigDto) -> CoreResult<Vec<OsString>> {
        Self::compile_args_with_skipped_rules(config, &HashSet::new())
    }

    /// Compiles `HostFullConfigDto` into a safe `Vec<OsString>` argument list for `ssh.exe`,
    /// omitting any Local/Dynamic port forward rules present in `skipped_rule_ids`.
    pub fn compile_args_with_skipped_rules(
        config: &HostFullConfigDto,
        skipped_rule_ids: &HashSet<String>,
    ) -> CoreResult<Vec<OsString>> {
        let (host, _) = validate_host_target(config)?;

        let mut args: Vec<OsString> = Vec::with_capacity(26);
        push_base_target_args(&mut args, config);
        args.push(OsString::from("-o"));
        args.push(OsString::from("ConnectTimeout=8"));

        match config.auth_method.as_str() {
            "SSH_KEY" => {
                let key_path = config
                    .private_key_path
                    .as_deref()
                    .map(str::trim)
                    .filter(|s| !s.is_empty())
                    .ok_or_else(|| {
                        CoreError::Validation(
                            "SSH_KEY authentication requires a valid private_key_path".to_string(),
                        )
                    })?;

                push_key_identity_args(&mut args, key_path);
            }
            "PASSWORD" => {
                args.push(OsString::from("-o"));
                args.push(OsString::from(
                    "PreferredAuthentications=password,keyboard-interactive",
                ));
                args.push(OsString::from("-o"));
                args.push(OsString::from("PubkeyAuthentication=no"));
            }
            other => {
                return Err(CoreError::Validation(format!(
                    "Unsupported auth_method: {other}"
                )));
            }
        }

        if config.options.server_alive_interval > 0 {
            args.push(OsString::from("-o"));
            args.push(OsString::from(format!(
                "ServerAliveInterval={}",
                config.options.server_alive_interval
            )));
            args.push(OsString::from("-o"));
            args.push(OsString::from(format!(
                "ServerAliveCountMax={}",
                config.options.server_alive_count_max.max(1)
            )));
        }

        if config.options.compression {
            args.push(OsString::from("-C"));
        }

        if config.options.forward_agent {
            args.push(OsString::from("-A"));
        }

        push_strict_host_key_arg(&mut args, &config.options.strict_host_key_checking);

        for pf in config
            .port_forwards
            .iter()
            .filter(|r| r.is_enabled && !skipped_rule_ids.contains(&r.id))
        {
            match pf.forward_type.as_str() {
                "LOCAL" => {
                    if let (Some(ref th), Some(tp)) = (&pf.target_host, pf.target_port) {
                        args.push(OsString::from("-L"));
                        args.push(OsString::from(format!(
                            "{}:{}:{}:{}",
                            pf.bind_address, pf.bind_port, th, tp
                        )));
                    }
                }
                "REMOTE" => {
                    if let (Some(ref th), Some(tp)) = (&pf.target_host, pf.target_port) {
                        args.push(OsString::from("-R"));
                        args.push(OsString::from(format!(
                            "{}:{}:{}:{}",
                            pf.bind_address, pf.bind_port, th, tp
                        )));
                    }
                }
                "DYNAMIC" => {
                    args.push(OsString::from("-D"));
                    args.push(OsString::from(format!(
                        "{}:{}",
                        pf.bind_address, pf.bind_port
                    )));
                }
                _ => {}
            }
        }

        let startup_cmd = config
            .options
            .startup_command
            .as_deref()
            .map(str::trim)
            .filter(|s| !s.is_empty());

        if let Some(cmd) = startup_cmd {
            args.push(OsString::from("-t"));
            args.push(OsString::from("--"));
            args.push(OsString::from(host));
            args.push(OsString::from(format!(
                "{cmd}; exec ${{SHELL:-/bin/sh}} -l"
            )));
        } else {
            args.push(OsString::from("--"));
            args.push(OsString::from(host));
        }

        Ok(args)
    }

    pub fn format_cli_preview(args: &[OsString]) -> String {
        let mut parts = Vec::with_capacity(args.len() + 1);
        let ssh_bin = if cfg!(windows) { "ssh.exe" } else { "ssh" };
        parts.push(ssh_bin.to_string());
        for raw in args {
            let s = raw.to_string_lossy();
            if s.contains([' ', ';', '$']) {
                parts.push(format!("\"{s}\""));
            } else {
                parts.push(s.into_owned());
            }
        }
        parts.join(" ")
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ipc::dto::{PortForwardRuleDto, SshOptionsDto};
    use crate::ssh::ActiveTunnelRegistry;

    fn sample_base_config() -> HostFullConfigDto {
        HostFullConfigDto {
            id: "host-1".to_string(),
            alias: "Production Node".to_string(),
            host: "203.0.113.10".to_string(),
            port: 2222,
            username: "deploy".to_string(),
            group_name: "Production".to_string(),
            tags: vec![],
            auth_method: "SSH_KEY".to_string(),
            ssh_key_id: Some("key-1".to_string()),
            private_key_path: Some(r"C:\Users\Admin\.ssh\id_ed25519".to_string()),
            password_mode: "NONE".to_string(),
            has_saved_password: false,
            last_connected_at: None,
            created_at: "2026-01-01T00:00:00Z".to_string(),
            updated_at: "2026-01-01T00:00:00Z".to_string(),
            options: SshOptionsDto {
                host_id: "host-1".to_string(),
                server_alive_interval: 60,
                server_alive_count_max: 3,
                compression: false,
                strict_host_key_checking: "ACCEPT_NEW".to_string(),
                startup_command: None,
                forward_agent: false,
                auto_reconnect: true,
                reconnect_interval_sec: 2,
            },
            port_forwards: vec![],
        }
    }

    #[test]
    fn test_compile_ssh_key_mode_arguments() {
        let cfg = sample_base_config();
        let args = SshCommandCompiler::compile_args(&cfg).expect("compile SSH_KEY args");
        let str_args: Vec<String> = args
            .iter()
            .map(|s| s.to_string_lossy().to_string())
            .collect();

        assert_eq!(
            str_args,
            vec![
                "-p",
                "2222",
                "-l",
                "deploy",
                "-o",
                "ConnectTimeout=8",
                "-i",
                r"C:\Users\Admin\.ssh\id_ed25519",
                "-o",
                "IdentitiesOnly=yes",
                "-o",
                "ServerAliveInterval=60",
                "-o",
                "ServerAliveCountMax=3",
                "-o",
                "StrictHostKeyChecking=accept-new",
                "--",
                "203.0.113.10",
            ]
        );
    }

    #[test]
    fn test_compile_password_mode_arguments() {
        let mut cfg = sample_base_config();
        cfg.auth_method = "PASSWORD".to_string();
        cfg.private_key_path = None;
        cfg.password_mode = "PROMPT_EVERY_TIME".to_string();
        cfg.port = 22;
        cfg.username = "root".to_string();

        let args = SshCommandCompiler::compile_args(&cfg).expect("compile PASSWORD args");
        let str_args: Vec<String> = args
            .iter()
            .map(|s| s.to_string_lossy().to_string())
            .collect();

        assert_eq!(
            str_args,
            vec![
                "-p",
                "22",
                "-l",
                "root",
                "-o",
                "ConnectTimeout=8",
                "-o",
                "PreferredAuthentications=password,keyboard-interactive",
                "-o",
                "PubkeyAuthentication=no",
                "-o",
                "ServerAliveInterval=60",
                "-o",
                "ServerAliveCountMax=3",
                "-o",
                "StrictHostKeyChecking=accept-new",
                "--",
                "203.0.113.10",
            ]
        );
    }

    #[test]
    fn test_compile_all_flags_and_multi_tab_tunnel_sharing() {
        let mut cfg = sample_base_config();
        cfg.options.compression = true;
        cfg.options.forward_agent = true;
        cfg.options.strict_host_key_checking = "YES".to_string();
        cfg.options.startup_command = Some("tmux attach || tmux new".to_string());
        cfg.port_forwards = vec![
            PortForwardRuleDto {
                id: "pf-local".to_string(),
                host_id: "host-1".to_string(),
                label: "Web".to_string(),
                forward_type: "LOCAL".to_string(),
                bind_address: "127.0.0.1".to_string(),
                bind_port: 8080,
                target_host: Some("localhost".to_string()),
                target_port: Some(80),
                is_enabled: true,
            },
            PortForwardRuleDto {
                id: "pf-remote".to_string(),
                host_id: "host-1".to_string(),
                label: "Webhook".to_string(),
                forward_type: "REMOTE".to_string(),
                bind_address: "0.0.0.0".to_string(),
                bind_port: 9000,
                target_host: Some("127.0.0.1".to_string()),
                target_port: Some(3000),
                is_enabled: true,
            },
            PortForwardRuleDto {
                id: "pf-dynamic".to_string(),
                host_id: "host-1".to_string(),
                label: "SOCKS".to_string(),
                forward_type: "DYNAMIC".to_string(),
                bind_address: "127.0.0.1".to_string(),
                bind_port: 1080,
                target_host: None,
                target_port: None,
                is_enabled: true,
            },
        ];

        // Tab 1: No existing tunnels -> includes -L, -R, and -D
        let registry = ActiveTunnelRegistry::new();
        let tab1_skipped = registry.shared_rule_ids_for_host(&cfg.id, &cfg.port_forwards);
        assert!(tab1_skipped.is_empty());

        let tab1_args: Vec<String> =
            SshCommandCompiler::compile_args_with_skipped_rules(&cfg, &tab1_skipped)
                .unwrap()
                .iter()
                .map(|s| s.to_string_lossy().to_string())
                .collect();

        assert!(tab1_args.contains(&"-C".to_string()));
        assert!(tab1_args.contains(&"-A".to_string()));
        assert!(tab1_args.contains(&"-L".to_string()));
        assert!(tab1_args.contains(&"127.0.0.1:8080:localhost:80".to_string()));
        assert!(tab1_args.contains(&"-R".to_string()));
        assert!(tab1_args.contains(&"0.0.0.0:9000:127.0.0.1:3000".to_string()));
        assert!(tab1_args.contains(&"-D".to_string()));
        assert!(tab1_args.contains(&"127.0.0.1:1080".to_string()));
        assert_eq!(
            tab1_args.last().unwrap(),
            "tmux attach || tmux new; exec ${SHELL:-/bin/sh} -l"
        );

        // Register Tab 1's active tunnels
        let tab1_statuses = registry.build_session_forward_statuses(
            "tab-1",
            &cfg.id,
            &cfg.port_forwards,
            &tab1_skipped,
        );
        assert_eq!(tab1_statuses.len(), 3);

        // Tab 2 on the same host: automatically skips duplicate -L (8080) and -D (1080)
        let tab2_skipped = registry.shared_rule_ids_for_host(&cfg.id, &cfg.port_forwards);
        assert!(tab2_skipped.contains("pf-local"));
        assert!(tab2_skipped.contains("pf-dynamic"));
        assert!(!tab2_skipped.contains("pf-remote"));

        let tab2_args: Vec<String> =
            SshCommandCompiler::compile_args_with_skipped_rules(&cfg, &tab2_skipped)
                .unwrap()
                .iter()
                .map(|s| s.to_string_lossy().to_string())
                .collect();

        assert!(!tab2_args.contains(&"-L".to_string()));
        assert!(!tab2_args.contains(&"-D".to_string()));
        assert!(tab2_args.contains(&"-R".to_string()));
        assert!(tab2_args.contains(&"--".to_string()));
    }

    #[test]
    fn test_format_cli_preview_quotes_special_args() {
        let args = vec![
            OsString::from("-p"),
            OsString::from("22"),
            OsString::from("my key path"),
            OsString::from("echo $HOME; sh"),
        ];
        let expected_bin = if cfg!(windows) { "ssh.exe" } else { "ssh" };
        assert_eq!(
            SshCommandCompiler::format_cli_preview(&args),
            format!("{expected_bin} -p 22 \"my key path\" \"echo $HOME; sh\"")
        );
    }

    #[test]
    fn test_compiler_rejects_injected_host_and_user_flags() {
        let mut cfg = sample_base_config();

        // Host starting with '-'
        cfg.host = "-oProxyCommand=calc.exe".to_string();
        assert!(SshCommandCompiler::compile_args(&cfg).is_err());

        cfg.host = "-F/etc/passwd".to_string();
        assert!(SshCommandCompiler::compile_args(&cfg).is_err());

        // Host containing whitespace or newline
        cfg.host = "server.local ; whoami".to_string();
        assert!(SshCommandCompiler::compile_args(&cfg).is_err());

        cfg.host = "server.local\nwhoami".to_string();
        assert!(SshCommandCompiler::compile_args(&cfg).is_err());

        // Username starting with '-'
        cfg.host = "192.168.1.1".to_string();
        cfg.username = "-oProxyCommand=calc.exe".to_string();
        assert!(SshCommandCompiler::compile_args(&cfg).is_err());

        // Username containing whitespace
        cfg.username = "user name".to_string();
        assert!(SshCommandCompiler::compile_args(&cfg).is_err());
    }
}

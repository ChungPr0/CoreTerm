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
            "PreferredAuthentications=publickey",
            "-o",
            "PasswordAuthentication=no",
            "-o",
            "KbdInteractiveAuthentication=no",
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

    let tab1_statuses = registry.build_session_forward_statuses(
        "tab-1",
        &cfg.id,
        &cfg.port_forwards,
        &tab1_skipped,
    );
    assert_eq!(tab1_statuses.len(), 3);

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

    cfg.host = "-oProxyCommand=calc.exe".to_string();
    assert!(SshCommandCompiler::compile_args(&cfg).is_err());

    cfg.host = "-F/etc/passwd".to_string();
    assert!(SshCommandCompiler::compile_args(&cfg).is_err());

    cfg.host = "server.local ; whoami".to_string();
    assert!(SshCommandCompiler::compile_args(&cfg).is_err());

    cfg.host = "server.local\nwhoami".to_string();
    assert!(SshCommandCompiler::compile_args(&cfg).is_err());

    cfg.host = "192.168.1.1".to_string();
    cfg.username = "-oProxyCommand=calc.exe".to_string();
    assert!(SshCommandCompiler::compile_args(&cfg).is_err());

    cfg.username = "user name".to_string();
    assert!(SshCommandCompiler::compile_args(&cfg).is_err());
}

#[test]
fn test_compiler_strict_host_key_options() {
    let mut cfg = sample_base_config();

    cfg.options.strict_host_key_checking = "YES".to_string();
    let args = SshCommandCompiler::compile_args(&cfg).unwrap();
    assert!(args.contains(&OsString::from("StrictHostKeyChecking=ask")));

    cfg.options.strict_host_key_checking = "NO".to_string();
    let args = SshCommandCompiler::compile_args(&cfg).unwrap();
    assert!(args.contains(&OsString::from("StrictHostKeyChecking=no")));

    cfg.options.strict_host_key_checking = "CUSTOM_UNKNOWN".to_string();
    let args = SshCommandCompiler::compile_args(&cfg).unwrap();
    assert!(args.contains(&OsString::from("StrictHostKeyChecking=accept-new")));
}

#[test]
fn test_compiler_ipv6_and_domain_hosts() {
    let mut cfg = sample_base_config();

    cfg.host = "2001:db8::1".to_string();
    let args = SshCommandCompiler::compile_args(&cfg).unwrap();
    assert_eq!(args.last().unwrap(), "2001:db8::1");

    cfg.host = "::1".to_string();
    let args = SshCommandCompiler::compile_args(&cfg).unwrap();
    assert_eq!(args.last().unwrap(), "::1");

    cfg.host = "api-node-01.eu-west.example.com".to_string();
    let args = SshCommandCompiler::compile_args(&cfg).unwrap();
    assert_eq!(args.last().unwrap(), "api-node-01.eu-west.example.com");
}

#[test]
fn test_compiler_validation_failures_for_empty_and_unsupported_inputs() {
    let mut cfg = sample_base_config();

    cfg.host = "".to_string();
    assert!(SshCommandCompiler::compile_args(&cfg).is_err());
    cfg.host = "   ".to_string();
    assert!(SshCommandCompiler::compile_args(&cfg).is_err());

    cfg.host = "10.0.0.1".to_string();
    cfg.username = "".to_string();
    assert!(SshCommandCompiler::compile_args(&cfg).is_err());
    cfg.username = "  \t ".to_string();
    assert!(SshCommandCompiler::compile_args(&cfg).is_err());

    cfg.username = "deploy".to_string();
    cfg.private_key_path = None;
    assert!(SshCommandCompiler::compile_args(&cfg).is_err());
    cfg.private_key_path = Some("   ".to_string());
    assert!(SshCommandCompiler::compile_args(&cfg).is_err());

    cfg.private_key_path = Some("C:\\key".to_string());
    cfg.auth_method = "KERBEROS_TICKET".to_string();
    assert!(SshCommandCompiler::compile_args(&cfg).is_err());
}

#[test]
fn test_compiler_handles_disabled_and_partial_port_forwards() {
    let mut cfg = sample_base_config();
    cfg.port_forwards = vec![
        PortForwardRuleDto {
            id: "pf-disabled".to_string(),
            host_id: "host-1".to_string(),
            label: "Disabled Rule".to_string(),
            forward_type: "LOCAL".to_string(),
            bind_address: "127.0.0.1".to_string(),
            bind_port: 8080,
            target_host: Some("localhost".to_string()),
            target_port: Some(80),
            is_enabled: false,
        },
        PortForwardRuleDto {
            id: "pf-incomplete-remote".to_string(),
            host_id: "host-1".to_string(),
            label: "Incomplete Remote".to_string(),
            forward_type: "REMOTE".to_string(),
            bind_address: "0.0.0.0".to_string(),
            bind_port: 9000,
            target_host: None,
            target_port: None,
            is_enabled: true,
        },
    ];

    let args = SshCommandCompiler::compile_args(&cfg).unwrap();
    let str_args: Vec<String> = args
        .iter()
        .map(|s| s.to_string_lossy().to_string())
        .collect();

    assert!(!str_args.contains(&"-L".to_string()));
    assert!(!str_args.contains(&"-R".to_string()));
}

use std::collections::HashSet;
use std::ffi::OsString;

use crate::core::defaults::SSH_CONNECT_TIMEOUT_SECS;
use crate::core::error::{CoreError, CoreResult};
use crate::infra::db::port_forward_repo::{
    normalize_targets, validate_and_normalize_bind_address,
};
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

        let mut args: Vec<OsString> = Vec::with_capacity(32);
        push_base_target_args(&mut args, config);
        args.push(OsString::from("-o"));
        args.push(OsString::from(format!(
            "ConnectTimeout={SSH_CONNECT_TIMEOUT_SECS}"
        )));

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
                args.push(OsString::from("-o"));
                args.push(OsString::from("PreferredAuthentications=publickey"));
                args.push(OsString::from("-o"));
                args.push(OsString::from("PasswordAuthentication=no"));
                args.push(OsString::from("-o"));
                args.push(OsString::from("KbdInteractiveAuthentication=no"));
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
            if pf.bind_port == 0 {
                continue;
            }
            let bind_addr = validate_and_normalize_bind_address(&pf.bind_address)?;
            match pf.forward_type.as_str() {
                "LOCAL" => {
                    if let (Some(_), Some(_)) = (&pf.target_host, pf.target_port) {
                        let (Some(th), Some(tp)) =
                            normalize_targets("LOCAL", pf.target_host.clone(), pf.target_port)?
                        else {
                            continue;
                        };
                        args.push(OsString::from("-L"));
                        args.push(OsString::from(format!(
                            "{}:{}:{}:{}",
                            bind_addr, pf.bind_port, th, tp
                        )));
                    }
                }
                "REMOTE" => {
                    if let (Some(_), Some(_)) = (&pf.target_host, pf.target_port) {
                        let (Some(th), Some(tp)) =
                            normalize_targets("REMOTE", pf.target_host.clone(), pf.target_port)?
                        else {
                            continue;
                        };
                        args.push(OsString::from("-R"));
                        args.push(OsString::from(format!(
                            "{}:{}:{}:{}",
                            bind_addr, pf.bind_port, th, tp
                        )));
                    }
                }
                "DYNAMIC" => {
                    args.push(OsString::from("-D"));
                    args.push(OsString::from(format!("{}:{}", bind_addr, pf.bind_port)));
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
#[path = "compiler_tests.rs"]
mod tests;

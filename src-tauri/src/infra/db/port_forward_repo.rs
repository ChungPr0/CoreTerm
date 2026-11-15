use std::collections::HashSet;

use rusqlite::{params, Connection};
use uuid::Uuid;

use crate::core::error::{CoreError, CoreResult};
use crate::ipc::dto::{
    DeleteResultDto, PortForwardRuleDto, PortForwardToggleResultDto, SavePortForwardDto,
    UpsertPortForwardRequestDto,
};

pub fn list_by_host(conn: &Connection, host_id: &str) -> CoreResult<Vec<PortForwardRuleDto>> {
    let mut stmt = conn.prepare(
        r#"
        SELECT id, host_id, label, forward_type, bind_address,
               bind_port, target_host, target_port, is_enabled
        FROM port_forwards
        WHERE host_id = ?1
        ORDER BY created_at ASC
        "#,
    )?;

    let rows = stmt.query_map(params![host_id], |row| {
        let is_enabled: i64 = row.get(8)?;
        Ok(PortForwardRuleDto {
            id: row.get(0)?,
            host_id: row.get(1)?,
            label: row.get(2)?,
            forward_type: row.get(3)?,
            bind_address: row.get(4)?,
            bind_port: row.get(5)?,
            target_host: row.get(6)?,
            target_port: row.get(7)?,
            is_enabled: is_enabled != 0,
        })
    })?;

    let mut rules = Vec::new();
    for r in rows {
        rules.push(r?);
    }
    Ok(rules)
}

pub fn normalize_targets(
    forward_type: &str,
    target_host: Option<String>,
    target_port: Option<u16>,
) -> CoreResult<(Option<String>, Option<u16>)> {
    match forward_type {
        "DYNAMIC" => Ok((None, None)),
        "LOCAL" | "REMOTE" => {
            let th = target_host
                .map(|s| s.trim().to_string())
                .filter(|s| !s.is_empty())
                .ok_or_else(|| {
                    CoreError::Validation(format!(
                        "{forward_type} port forward requires a target host"
                    ))
                })?;
            let tp = target_port.filter(|p| *p > 0).ok_or_else(|| {
                CoreError::Validation(format!(
                    "{forward_type} port forward requires a valid target port"
                ))
            })?;
            Ok((Some(th), Some(tp)))
        }
        other => Err(CoreError::Validation(format!(
            "Invalid forward_type '{other}'"
        ))),
    }
}

pub fn upsert(
    conn: &Connection,
    req: UpsertPortForwardRequestDto,
) -> CoreResult<PortForwardRuleDto> {
    if req.bind_port == 0 {
        return Err(CoreError::Validation(
            "Bind port must be between 1 and 65535".to_string(),
        ));
    }
    let rule_id = req
        .id
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| Uuid::new_v4().to_string());
    let bind_address = if req.bind_address.trim().is_empty() {
        "127.0.0.1".to_string()
    } else {
        req.bind_address.trim().to_string()
    };
    let (target_host, target_port) =
        normalize_targets(&req.forward_type, req.target_host, req.target_port)?;

    conn.execute(
        r#"
        INSERT INTO port_forwards (
            id, host_id, label, forward_type, bind_address,
            bind_port, target_host, target_port, is_enabled
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
        ON CONFLICT(id) DO UPDATE SET
            label = excluded.label,
            forward_type = excluded.forward_type,
            bind_address = excluded.bind_address,
            bind_port = excluded.bind_port,
            target_host = excluded.target_host,
            target_port = excluded.target_port,
            is_enabled = excluded.is_enabled
        "#,
        params![
            rule_id,
            req.host_id,
            req.label,
            req.forward_type,
            bind_address,
            req.bind_port,
            target_host,
            target_port,
            if req.is_enabled { 1 } else { 0 },
        ],
    )?;

    Ok(PortForwardRuleDto {
        id: rule_id,
        host_id: req.host_id,
        label: req.label,
        forward_type: req.forward_type,
        bind_address,
        bind_port: req.bind_port,
        target_host,
        target_port,
        is_enabled: req.is_enabled,
    })
}

/// Atomically syncs all port forward rules for `host_id` inside the caller's transaction.
pub fn replace_for_host(
    conn: &Connection,
    host_id: &str,
    rules: &[SavePortForwardDto],
) -> CoreResult<()> {
    let keep_ids: HashSet<String> = rules
        .iter()
        .filter_map(|r| r.id.as_deref().map(str::trim).filter(|s| !s.is_empty()))
        .map(str::to_string)
        .collect();

    let existing = list_by_host(conn, host_id)?;
    for rule in existing {
        if !keep_ids.contains(&rule.id) {
            conn.execute("DELETE FROM port_forwards WHERE id = ?1", params![rule.id])?;
        }
    }

    for rule in rules {
        upsert(
            conn,
            UpsertPortForwardRequestDto {
                id: rule.id.clone(),
                host_id: host_id.to_string(),
                label: rule.label.clone(),
                forward_type: rule.forward_type.clone(),
                bind_address: rule.bind_address.clone(),
                bind_port: rule.bind_port,
                target_host: rule.target_host.clone(),
                target_port: rule.target_port,
                is_enabled: rule.is_enabled,
            },
        )?;
    }

    Ok(())
}

pub fn toggle(
    conn: &Connection,
    rule_id: &str,
    is_enabled: bool,
) -> CoreResult<PortForwardToggleResultDto> {
    let affected = conn.execute(
        "UPDATE port_forwards SET is_enabled = ?2 WHERE id = ?1",
        params![rule_id, if is_enabled { 1 } else { 0 }],
    )?;
    if affected == 0 {
        return Err(CoreError::NotFound(format!(
            "Port forward rule not found: {rule_id}"
        )));
    }
    Ok(PortForwardToggleResultDto {
        rule_id: rule_id.to_string(),
        is_enabled,
    })
}

pub fn delete(conn: &Connection, rule_id: &str) -> CoreResult<DeleteResultDto> {
    let affected = conn.execute("DELETE FROM port_forwards WHERE id = ?1", params![rule_id])?;
    Ok(DeleteResultDto {
        deleted: affected > 0,
    })
}

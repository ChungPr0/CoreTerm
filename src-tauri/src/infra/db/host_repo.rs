use rusqlite::{params, Connection, OptionalExtension};

use crate::core::error::{CoreError, CoreResult};
use crate::infra::db::port_forward_repo;
use crate::ipc::dto::{
    HostFullConfigDto, HostProfileSummaryDto, SshOptionsDto, UpdateSshOptionsFieldsDto,
};

pub struct HostRowWrite<'a> {
    pub id: &'a str,
    pub alias: &'a str,
    pub host: &'a str,
    pub port: u16,
    pub username: &'a str,
    pub group_name: &'a str,
    pub tags_json: &'a str,
    pub auth_method: &'a str,
    pub ssh_key_id: Option<&'a str>,
    pub private_key_path: Option<&'a str>,
    pub password_mode: &'a str,
    pub secret_ref_id: Option<&'a str>,
}

pub fn list(
    conn: &Connection,
    group_filter: Option<String>,
    tag_filter: Option<String>,
    search_query: Option<String>,
) -> CoreResult<Vec<HostProfileSummaryDto>> {
    let mut stmt = conn.prepare(
        r#"
        SELECT
            v.id,
            v.alias,
            v.host,
            v.port,
            v.username,
            v.group_name,
            v.tags_json,
            v.auth_method,
            v.ssh_key_id,
            k.name AS ssh_key_name,
            COALESCE(k.private_key_path, v.private_key_path) AS private_key_path,
            v.password_mode,
            v.secret_ref_id,
            (SELECT COUNT(*) FROM port_forwards pf WHERE pf.host_id = v.id AND pf.is_enabled = 1) AS active_pf_count,
            COALESCE(o.auto_reconnect, 0) AS auto_reconnect,
            COALESCE(o.reconnect_interval_sec, 2) AS reconnect_interval_sec,
            v.last_connected_at,
            v.created_at,
            v.updated_at
        FROM host_profiles v
        LEFT JOIN ssh_keys k ON v.ssh_key_id = k.id
        LEFT JOIN ssh_options o ON v.id = o.host_id
        ORDER BY v.group_name ASC, v.alias ASC
        "#,
    )?;

    let rows = stmt.query_map([], |row| {
        let tags_json: String = row.get(6)?;
        let tags: Vec<String> = serde_json::from_str(&tags_json).unwrap_or_default();
        let secret_ref_id: Option<String> = row.get(12)?;
        let active_pf_count: i64 = row.get(13)?;
        let auto_reconnect: i64 = row.get(14)?;

        Ok(HostProfileSummaryDto {
            id: row.get(0)?,
            alias: row.get(1)?,
            host: row.get(2)?,
            port: row.get(3)?,
            username: row.get(4)?,
            group_name: row.get(5)?,
            tags,
            auth_method: row.get(7)?,
            ssh_key_id: row.get(8)?,
            ssh_key_name: row.get(9)?,
            private_key_path: row.get(10)?,
            password_mode: row.get(11)?,
            has_saved_password: secret_ref_id.is_some(),
            active_port_forwards_count: active_pf_count as usize,
            auto_reconnect: auto_reconnect != 0,
            reconnect_interval_sec: row.get(15)?,
            last_connected_at: row.get(16)?,
            created_at: row.get(17)?,
            updated_at: row.get(18)?,
        })
    })?;

    let group_f = group_filter
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());
    let tag_f = tag_filter
        .map(|s| s.trim().to_lowercase())
        .filter(|s| !s.is_empty());
    let query_f = search_query
        .map(|s| s.trim().to_lowercase())
        .filter(|s| !s.is_empty());

    let mut items = Vec::new();
    for item in rows {
        let dto = item?;
        if let Some(ref gf) = group_f {
            if !dto.group_name.eq_ignore_ascii_case(gf) {
                continue;
            }
        }
        if let Some(ref tf) = tag_f {
            if !dto.tags.iter().any(|t| t.to_lowercase() == *tf) {
                continue;
            }
        }
        if let Some(ref q) = query_f {
            let matched = dto.alias.to_lowercase().contains(q)
                || dto.host.to_lowercase().contains(q)
                || dto.username.to_lowercase().contains(q)
                || dto.group_name.to_lowercase().contains(q);
            if !matched {
                continue;
            }
        }
        items.push(dto);
    }

    Ok(items)
}

pub fn get_detail(conn: &Connection, host_id: &str) -> CoreResult<HostFullConfigDto> {
    let mut stmt = conn.prepare(
        r#"
        SELECT
            v.id,
            v.alias,
            v.host,
            v.port,
            v.username,
            v.group_name,
            v.tags_json,
            v.auth_method,
            v.ssh_key_id,
            COALESCE(k.private_key_path, v.private_key_path) AS private_key_path,
            v.password_mode,
            v.secret_ref_id,
            v.last_connected_at,
            v.created_at,
            v.updated_at
        FROM host_profiles v
        LEFT JOIN ssh_keys k ON v.ssh_key_id = k.id
        WHERE v.id = ?1
        "#,
    )?;

    let row = stmt
        .query_row(params![host_id], |row| {
            let tags_json: String = row.get(6)?;
            let tags: Vec<String> = serde_json::from_str(&tags_json).unwrap_or_default();
            let secret_ref_id: Option<String> = row.get(11)?;
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, u16>(3)?,
                row.get::<_, String>(4)?,
                row.get::<_, String>(5)?,
                tags,
                row.get::<_, String>(7)?,
                row.get::<_, Option<String>>(8)?,
                row.get::<_, Option<String>>(9)?,
                row.get::<_, String>(10)?,
                secret_ref_id.is_some(),
                row.get::<_, Option<String>>(12)?,
                row.get::<_, String>(13)?,
                row.get::<_, String>(14)?,
            ))
        })
        .optional()?
        .ok_or_else(|| CoreError::NotFound(format!("Host profile not found: {host_id}")))?;

    let options = get_options(conn, host_id)?;
    let port_forwards = port_forward_repo::list_by_host(conn, host_id)?;

    Ok(HostFullConfigDto {
        id: row.0,
        alias: row.1,
        host: row.2,
        port: row.3,
        username: row.4,
        group_name: row.5,
        tags: row.6,
        auth_method: row.7,
        ssh_key_id: row.8,
        private_key_path: row.9,
        password_mode: row.10,
        has_saved_password: row.11,
        last_connected_at: row.12,
        created_at: row.13,
        updated_at: row.14,
        options,
        port_forwards,
    })
}

pub fn get_options(conn: &Connection, host_id: &str) -> CoreResult<SshOptionsDto> {
    let opt = conn
        .query_row(
            r#"
            SELECT host_id, server_alive_interval, server_alive_count_max,
                   compression, strict_host_key_checking, startup_command,
                   forward_agent,
                   COALESCE(auto_reconnect, 0), COALESCE(reconnect_interval_sec, 2)
            FROM ssh_options
            WHERE host_id = ?1
            "#,
            params![host_id],
            |row| {
                let compression: i64 = row.get(3)?;
                let forward_agent: i64 = row.get(6)?;
                let auto_reconnect: i64 = row.get(7)?;
                Ok(SshOptionsDto {
                    host_id: row.get(0)?,
                    server_alive_interval: row.get(1)?,
                    server_alive_count_max: row.get(2)?,
                    compression: compression != 0,
                    strict_host_key_checking: row.get(4)?,
                    startup_command: row.get(5)?,
                    forward_agent: forward_agent != 0,
                    auto_reconnect: auto_reconnect != 0,
                    reconnect_interval_sec: row.get(8)?,
                })
            },
        )
        .optional()?;

    Ok(opt.unwrap_or(SshOptionsDto {
        host_id: host_id.to_string(),
        server_alive_interval: 60,
        server_alive_count_max: 3,
        compression: false,
        strict_host_key_checking: "ACCEPT_NEW".to_string(),
        startup_command: None,
        forward_agent: false,
        auto_reconnect: false,
        reconnect_interval_sec: 2,
    }))
}

pub fn insert_profile(conn: &Connection, row: &HostRowWrite<'_>) -> CoreResult<()> {
    conn.execute(
        r#"
        INSERT INTO host_profiles (
            id, alias, host, port, username, group_name,
            tags_json, auth_method, ssh_key_id, private_key_path, password_mode, secret_ref_id
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)
        "#,
        params![
            row.id,
            row.alias,
            row.host,
            row.port,
            row.username,
            row.group_name,
            row.tags_json,
            row.auth_method,
            row.ssh_key_id,
            row.private_key_path,
            row.password_mode,
            row.secret_ref_id,
        ],
    )?;
    Ok(())
}

pub fn update_profile(conn: &Connection, row: &HostRowWrite<'_>) -> CoreResult<()> {
    conn.execute(
        r#"
        UPDATE host_profiles
        SET alias = ?2,
            host = ?3,
            port = ?4,
            username = ?5,
            group_name = ?6,
            tags_json = ?7,
            auth_method = ?8,
            ssh_key_id = ?9,
            private_key_path = ?10,
            password_mode = ?11,
            secret_ref_id = ?12,
            updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
        WHERE id = ?1
        "#,
        params![
            row.id,
            row.alias,
            row.host,
            row.port,
            row.username,
            row.group_name,
            row.tags_json,
            row.auth_method,
            row.ssh_key_id,
            row.private_key_path,
            row.password_mode,
            row.secret_ref_id,
        ],
    )?;
    Ok(())
}

pub fn insert_options(
    conn: &Connection,
    host_id: &str,
    opts: &UpdateSshOptionsFieldsDto,
) -> CoreResult<()> {
    let startup_command = opts
        .startup_command
        .as_ref()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());

    conn.execute(
        r#"
        INSERT INTO ssh_options (
            host_id, server_alive_interval, server_alive_count_max,
            compression, strict_host_key_checking, startup_command,
            forward_agent, auto_reconnect, reconnect_interval_sec
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
        "#,
        params![
            host_id,
            opts.server_alive_interval.unwrap_or(60),
            opts.server_alive_count_max.unwrap_or(3),
            if opts.compression.unwrap_or(false) { 1 } else { 0 },
            opts.strict_host_key_checking.as_deref().unwrap_or("ACCEPT_NEW"),
            startup_command,
            if opts.forward_agent.unwrap_or(false) { 1 } else { 0 },
            if opts.auto_reconnect.unwrap_or(false) { 1 } else { 0 },
            opts.reconnect_interval_sec.unwrap_or(2).clamp(1, 60),
        ],
    )?;
    Ok(())
}

pub fn insert_cloned_options(
    conn: &Connection,
    host_id: &str,
    opts: &SshOptionsDto,
) -> CoreResult<()> {
    conn.execute(
        r#"
        INSERT INTO ssh_options (
            host_id, server_alive_interval, server_alive_count_max,
            compression, strict_host_key_checking, startup_command,
            forward_agent, auto_reconnect, reconnect_interval_sec
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
        "#,
        params![
            host_id,
            opts.server_alive_interval,
            opts.server_alive_count_max,
            if opts.compression { 1 } else { 0 },
            opts.strict_host_key_checking,
            opts.startup_command,
            if opts.forward_agent { 1 } else { 0 },
            if opts.auto_reconnect { 1 } else { 0 },
            opts.reconnect_interval_sec,
        ],
    )?;
    Ok(())
}

pub fn update_options(
    conn: &Connection,
    host_id: &str,
    opts: UpdateSshOptionsFieldsDto,
) -> CoreResult<()> {
    let cur = get_options(conn, host_id)?;
    let startup_command = match opts.startup_command {
        Some(s) => {
            let trimmed = s.trim().to_string();
            if trimmed.is_empty() { None } else { Some(trimmed) }
        }
        None => cur.startup_command,
    };
    conn.execute(
        r#"
        UPDATE ssh_options
        SET server_alive_interval = ?2,
            server_alive_count_max = ?3,
            compression = ?4,
            strict_host_key_checking = ?5,
            startup_command = ?6,
            forward_agent = ?7,
            auto_reconnect = ?8,
            reconnect_interval_sec = ?9,
            updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
        WHERE host_id = ?1
        "#,
        params![
            host_id,
            opts.server_alive_interval.unwrap_or(cur.server_alive_interval),
            opts.server_alive_count_max.unwrap_or(cur.server_alive_count_max),
            if opts.compression.unwrap_or(cur.compression) { 1 } else { 0 },
            opts.strict_host_key_checking.unwrap_or(cur.strict_host_key_checking),
            startup_command,
            if opts.forward_agent.unwrap_or(cur.forward_agent) { 1 } else { 0 },
            if opts.auto_reconnect.unwrap_or(cur.auto_reconnect) { 1 } else { 0 },
            opts.reconnect_interval_sec.unwrap_or(cur.reconnect_interval_sec).clamp(1, 60),
        ],
    )?;
    Ok(())
}

pub fn exists(conn: &Connection, host_id: &str) -> CoreResult<bool> {
    let found: Option<String> = conn
        .query_row(
            "SELECT id FROM host_profiles WHERE id = ?1",
            params![host_id],
            |r| r.get(0),
        )
        .optional()?;
    Ok(found.is_some())
}

pub fn update_group(conn: &Connection, host_id: &str, group_name: &str) -> CoreResult<()> {
    conn.execute(
        r#"
        UPDATE host_profiles
        SET group_name = ?2,
            updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
        WHERE id = ?1
        "#,
        params![host_id, group_name],
    )?;
    Ok(())
}

pub fn find_secret_ref(conn: &Connection, host_id: &str) -> CoreResult<Option<Option<String>>> {
    Ok(conn
        .query_row(
            "SELECT secret_ref_id FROM host_profiles WHERE id = ?1",
            params![host_id],
            |r| r.get(0),
        )
        .optional()?)
}

pub fn set_saved_secret(conn: &Connection, host_id: &str, ref_id: &str) -> CoreResult<()> {
    conn.execute(
        "UPDATE host_profiles SET password_mode = 'SAVED', secret_ref_id = ?2, updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE id = ?1",
        params![host_id, ref_id],
    )?;
    Ok(())
}

pub fn delete(conn: &Connection, host_id: &str) -> CoreResult<usize> {
    Ok(conn.execute("DELETE FROM host_profiles WHERE id = ?1", params![host_id])?)
}

pub fn touch_last_connected(conn: &Connection, host_id: &str) -> CoreResult<()> {
    conn.execute(
        "UPDATE host_profiles SET last_connected_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE id = ?1",
        params![host_id],
    )?;
    Ok(())
}

use rusqlite::{params, Connection, OptionalExtension};

use crate::core::error::{CoreError, CoreResult};
use crate::infra::db::SqliteDb;
use crate::ipc::dto::DeleteResultDto;

const MAX_GROUP_NAME_LEN: usize = 64;

fn next_sort_order(conn: &Connection) -> CoreResult<i64> {
    let max_order: i64 =
        conn.query_row("SELECT COALESCE(MAX(sort_order), 0) FROM host_groups", [], |r| r.get(0))?;
    Ok(if max_order > 0 { max_order + 1 } else { 0 })
}

/// Reuses existing canonical casing and persists custom groups when referenced by a host.
pub fn resolve_canonical(conn: &Connection, raw_group: &str) -> CoreResult<String> {
    let trimmed = raw_group.trim();
    if trimmed.is_empty() || trimmed.eq_ignore_ascii_case("default") {
        return Ok("Default".to_string());
    }
    let validated = SqliteDb::validate_entity_name(trimmed, "Group name", MAX_GROUP_NAME_LEN)?;
    let existing: Option<String> = conn
        .query_row(
            "SELECT name FROM host_groups WHERE LOWER(TRIM(name)) = LOWER(?1) LIMIT 1",
            params![validated],
            |r| r.get(0),
        )
        .optional()?;
    if let Some(canon) = existing {
        return Ok(canon);
    }
    let existing_in_profiles: Option<String> = conn
        .query_row(
            "SELECT group_name FROM host_profiles WHERE LOWER(TRIM(group_name)) = LOWER(?1) LIMIT 1",
            params![validated],
            |r| r.get(0),
        )
        .optional()?;
    let canonical = existing_in_profiles.unwrap_or(validated);
    let next_order = next_sort_order(conn)?;
    conn.execute(
        "INSERT OR IGNORE INTO host_groups (name, sort_order) VALUES (?1, ?2)",
        params![canonical, next_order],
    )?;
    Ok(canonical)
}

pub fn list(conn: &Connection) -> CoreResult<Vec<String>> {
    let mut stmt = conn.prepare(
        r#"
        SELECT name FROM (
            SELECT u.name, COALESCE(hg.sort_order, 0) AS sort_order
            FROM (
                SELECT name FROM host_groups
                UNION
                SELECT DISTINCT TRIM(group_name) AS name FROM host_profiles WHERE TRIM(group_name) <> ''
            ) u
            LEFT JOIN host_groups hg ON LOWER(TRIM(hg.name)) = LOWER(TRIM(u.name))
        )
        ORDER BY
            CASE WHEN sort_order > 0 THEN 0 ELSE 1 END,
            sort_order ASC,
            CASE WHEN LOWER(name) = 'default' THEN 0 ELSE 1 END,
            LOWER(name) ASC,
            name ASC
        "#,
    )?;
    let rows = stmt.query_map([], |row| row.get::<_, String>(0))?;
    let mut groups = Vec::new();
    for row in rows {
        groups.push(row?);
    }
    Ok(groups)
}

pub fn create(conn: &Connection, raw_name: &str) -> CoreResult<String> {
    let validated = SqliteDb::validate_entity_name(raw_name, "Group name", MAX_GROUP_NAME_LEN)?;
    let dup_group: Option<String> = conn
        .query_row(
            r#"
            SELECT name FROM (
                SELECT name FROM host_groups
                UNION
                SELECT DISTINCT TRIM(group_name) AS name FROM host_profiles WHERE TRIM(group_name) <> ''
            )
            WHERE LOWER(TRIM(name)) = LOWER(?1)
            LIMIT 1
            "#,
            params![validated],
            |r| r.get(0),
        )
        .optional()?;
    if let Some(existing) = dup_group {
        return Err(CoreError::Validation(format!(
            "Group name \"{existing}\" already exists"
        )));
    }
    let next_order = next_sort_order(conn)?;
    conn.execute(
        "INSERT INTO host_groups (name, sort_order) VALUES (?1, ?2)",
        params![validated, next_order],
    )?;
    Ok(validated)
}

pub fn reorder(conn: &mut Connection, ordered_names: &[String]) -> CoreResult<Vec<String>> {
    let mut cleaned = Vec::new();
    let mut seen_lower = std::collections::HashSet::new();
    for raw in ordered_names {
        let trimmed = raw.trim();
        if trimmed.is_empty() {
            continue;
        }
        let validated = SqliteDb::validate_entity_name(trimmed, "Group name", MAX_GROUP_NAME_LEN)?;
        let key = validated.to_lowercase();
        if seen_lower.insert(key) {
            cleaned.push(validated);
        }
    }

    let current_all = list(conn)?;
    let tx = conn.transaction()?;
    let mut pos: i64 = 0;

    for name in &cleaned {
        let existing_group: Option<String> = tx
            .query_row(
                "SELECT name FROM host_groups WHERE LOWER(TRIM(name)) = LOWER(?1) LIMIT 1",
                params![name],
                |r| r.get(0),
            )
            .optional()?;
        if let Some(canon) = existing_group {
            pos += 1;
            tx.execute(
                "UPDATE host_groups SET sort_order = ?1 WHERE name = ?2",
                params![pos, canon],
            )?;
            continue;
        }

        let profile_canon: Option<String> = if name.eq_ignore_ascii_case("default") {
            Some("Default".to_string())
        } else {
            tx.query_row(
                "SELECT TRIM(group_name) FROM host_profiles WHERE LOWER(TRIM(group_name)) = LOWER(?1) LIMIT 1",
                params![name],
                |r| r.get(0),
            )
            .optional()?
        };
        if let Some(canon) = profile_canon {
            pos += 1;
            tx.execute(
                "INSERT INTO host_groups (name, sort_order) VALUES (?1, ?2) ON CONFLICT(name) DO UPDATE SET sort_order = excluded.sort_order",
                params![canon, pos],
            )?;
        }
    }

    for leftover in current_all {
        if seen_lower.contains(&leftover.trim().to_lowercase()) {
            continue;
        }
        pos += 1;
        tx.execute(
            "INSERT INTO host_groups (name, sort_order) VALUES (?1, ?2) ON CONFLICT(name) DO UPDATE SET sort_order = excluded.sort_order",
            params![leftover, pos],
        )?;
    }

    tx.commit()?;
    list(conn)
}

pub fn delete(conn: &mut Connection, raw_name: &str) -> CoreResult<DeleteResultDto> {
    let trimmed = raw_name.trim();
    if trimmed.is_empty() || trimmed.eq_ignore_ascii_case("default") {
        return Err(CoreError::Validation(
            "Cannot delete Default group".to_string(),
        ));
    }
    let tx = conn.transaction()?;
    let moved_profiles = tx.execute(
        r#"
        UPDATE host_profiles
        SET group_name = 'Default',
            updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
        WHERE LOWER(TRIM(group_name)) = LOWER(?1)
        "#,
        params![trimmed],
    )?;
    let deleted_group = tx.execute(
        "DELETE FROM host_groups WHERE LOWER(TRIM(name)) = LOWER(?1)",
        params![trimmed],
    )?;
    tx.commit()?;
    Ok(DeleteResultDto {
        deleted: deleted_group > 0 || moved_profiles > 0,
    })
}

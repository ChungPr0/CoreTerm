use std::path::Path;

use rusqlite::{params, Connection, OptionalExtension, Row, TransactionBehavior};

use crate::core::error::{CoreError, CoreResult};
use crate::infra::db::SqliteDb;
use crate::ipc::dto::{SshKeyDto, UpdateDefaultKeyResultDto};

pub const MAX_KEY_NAME_LEN: usize = 64;

pub struct NewKeyRecord<'a> {
    pub id: &'a str,
    pub name: &'a str,
    pub key_type: &'a str,
    pub private_key_path: &'a str,
    pub public_key_content: Option<&'a str>,
    pub fingerprint: &'a str,
    pub has_passphrase: bool,
    pub secret_ref_id: Option<&'a str>,
    pub set_default: bool,
}

fn row_to_ssh_key(row: &Row<'_>) -> rusqlite::Result<SshKeyDto> {
    let private_key_path: String = row.get(3)?;
    let has_passphrase: i64 = row.get(6)?;
    let secret_ref_id: Option<String> = row.get(7)?;
    let is_default: i64 = row.get(8)?;
    Ok(SshKeyDto {
        id: row.get(0)?,
        name: row.get(1)?,
        key_type: row.get(2)?,
        file_exists: Path::new(&private_key_path).exists(),
        private_key_path,
        public_key_content: row.get(4)?,
        fingerprint: row.get(5)?,
        has_passphrase: has_passphrase != 0,
        has_saved_passphrase: secret_ref_id.is_some(),
        is_default: is_default != 0,
        created_at: row.get(9)?,
    })
}

pub fn list(conn: &Connection) -> CoreResult<Vec<SshKeyDto>> {
    let mut stmt = conn.prepare(
        r#"
        SELECT id, name, key_type, private_key_path, public_key_content,
               fingerprint, has_passphrase, secret_ref_id, is_default, created_at
        FROM ssh_keys
        ORDER BY is_default DESC, created_at DESC
        "#,
    )?;
    let rows = stmt.query_map([], row_to_ssh_key)?;
    let mut keys = Vec::new();
    for item in rows {
        keys.push(item?);
    }
    Ok(keys)
}

pub fn get_default(conn: &Connection) -> CoreResult<Option<SshKeyDto>> {
    let mut stmt = conn.prepare(
        r#"
        SELECT id, name, key_type, private_key_path, public_key_content,
               fingerprint, has_passphrase, secret_ref_id, is_default, created_at
        FROM ssh_keys
        WHERE is_default = 1
        LIMIT 1
        "#,
    )?;
    Ok(stmt.query_row([], row_to_ssh_key).optional()?)
}

pub fn get_by_id(conn: &Connection, key_id: &str) -> CoreResult<SshKeyDto> {
    conn.query_row(
        r#"
        SELECT id, name, key_type, private_key_path, public_key_content,
               fingerprint, has_passphrase, secret_ref_id, is_default, created_at
        FROM ssh_keys
        WHERE id = ?1
        "#,
        params![key_id],
        row_to_ssh_key,
    )
    .optional()?
    .ok_or_else(|| CoreError::NotFound(format!("SSH Key not found: {key_id}")))
}

pub fn exists(conn: &Connection, key_id: &str) -> CoreResult<bool> {
    let found: Option<String> = conn
        .query_row(
            "SELECT id FROM ssh_keys WHERE id = ?1 LIMIT 1",
            params![key_id],
            |row| row.get(0),
        )
        .optional()?;
    Ok(found.is_some())
}

pub fn validate_unique_name(conn: &Connection, raw_name: &str) -> CoreResult<String> {
    let trimmed = SqliteDb::validate_entity_name(raw_name, "Key name", MAX_KEY_NAME_LEN)?;
    let duplicate: Option<String> = conn
        .query_row(
            "SELECT id FROM ssh_keys WHERE LOWER(TRIM(name)) = LOWER(?1) LIMIT 1",
            params![trimmed],
            |row| row.get(0),
        )
        .optional()?;
    if duplicate.is_some() {
        return Err(CoreError::Validation(format!(
            "Key name \"{trimmed}\" already exists. Please choose a different name."
        )));
    }
    Ok(trimmed)
}

pub fn find_by_path(conn: &Connection, path: &str) -> CoreResult<Option<(String, String)>> {
    let sql = if cfg!(windows) {
        "SELECT id, name FROM ssh_keys WHERE LOWER(private_key_path) = LOWER(?1) LIMIT 1"
    } else {
        "SELECT id, name FROM ssh_keys WHERE private_key_path = ?1 LIMIT 1"
    };
    Ok(conn
        .query_row(sql, params![path], |row| Ok((row.get(0)?, row.get(1)?)))
        .optional()?)
}

pub fn find_name_by_fingerprint(conn: &Connection, fingerprint: &str) -> CoreResult<Option<String>> {
    Ok(conn
        .query_row(
            "SELECT name FROM ssh_keys WHERE fingerprint = ?1 LIMIT 1",
            params![fingerprint],
            |row| row.get(0),
        )
        .optional()?)
}

pub fn insert(conn: &mut Connection, rec: &NewKeyRecord<'_>) -> CoreResult<SshKeyDto> {
    let tx = conn.transaction_with_behavior(TransactionBehavior::Immediate)?;
    if rec.set_default {
        tx.execute("UPDATE ssh_keys SET is_default = 0 WHERE is_default = 1", [])?;
    }
    tx.execute(
        r#"
        INSERT INTO ssh_keys (
            id, name, key_type, private_key_path, public_key_content,
            fingerprint, has_passphrase, secret_ref_id, is_default
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
        "#,
        params![
            rec.id,
            rec.name,
            rec.key_type,
            rec.private_key_path,
            rec.public_key_content,
            rec.fingerprint,
            if rec.has_passphrase { 1 } else { 0 },
            rec.secret_ref_id,
            if rec.set_default { 1 } else { 0 },
        ],
    )?;
    tx.commit()?;

    get_by_id(conn, rec.id)
}

pub fn set_default(
    conn: &mut Connection,
    key_id: Option<String>,
) -> CoreResult<UpdateDefaultKeyResultDto> {
    let tx = conn.transaction_with_behavior(TransactionBehavior::Immediate)?;
    tx.execute("UPDATE ssh_keys SET is_default = 0 WHERE is_default = 1", [])?;
    if let Some(id) = key_id.filter(|s| !s.trim().is_empty()) {
        let affected = tx.execute(
            "UPDATE ssh_keys SET is_default = 1, updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE id = ?1",
            params![id],
        )?;
        if affected == 0 {
            return Err(CoreError::NotFound(format!("SSH Key not found: {id}")));
        }
    }
    tx.commit()?;
    Ok(UpdateDefaultKeyResultDto { updated: true })
}

pub fn get_delete_info(conn: &Connection, key_id: &str) -> CoreResult<Option<(String, Option<String>)>> {
    Ok(conn
        .query_row(
            "SELECT private_key_path, secret_ref_id FROM ssh_keys WHERE id = ?1",
            params![key_id],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .optional()?)
}

pub fn delete(conn: &Connection, key_id: &str) -> CoreResult<usize> {
    Ok(conn.execute("DELETE FROM ssh_keys WHERE id = ?1", params![key_id])?)
}

pub fn find_secret_ref(conn: &Connection, key_id: &str) -> CoreResult<Option<String>> {
    let res: Option<Option<String>> = conn
        .query_row(
            "SELECT secret_ref_id FROM ssh_keys WHERE id = ?1",
            params![key_id],
            |r| r.get(0),
        )
        .optional()?;
    Ok(res.flatten())
}

pub fn set_saved_secret(conn: &Connection, key_id: &str, ref_id: &str) -> CoreResult<()> {
    conn.execute(
        "UPDATE ssh_keys SET has_passphrase = 1, secret_ref_id = ?2, updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE id = ?1",
        params![key_id, ref_id],
    )?;
    Ok(())
}

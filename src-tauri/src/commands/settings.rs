use crate::commands::auth::{require_admin, require_session};
use crate::db::Db;
use crate::models::Settings;
use rusqlite::params;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::State;

fn get_setting(conn: &rusqlite::Connection, key: &str, default: &str) -> String {
    conn.query_row(
        "SELECT value FROM settings WHERE key=?1",
        params![key],
        |r| r.get(0),
    )
    .unwrap_or_else(|_| default.to_string())
}

fn set_setting(conn: &rusqlite::Connection, key: &str, value: &str) -> Result<(), String> {
    conn.execute(
        "INSERT INTO settings (key, value) VALUES (?1,?2)
         ON CONFLICT(key) DO UPDATE SET value=excluded.value",
        params![key, value],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn settings_from_conn(conn: &rusqlite::Connection) -> Settings {
    let default_vat = get_setting(conn, "default_vat", "21")
        .parse::<i32>()
        .unwrap_or(21);
    Settings {
        shop_name: get_setting(conn, "shop_name", "Mi Tienda"),
        ollama_model: get_setting(conn, "ollama_model", "qwen3.5:4b"),
        ollama_url: get_setting(conn, "ollama_url", "http://127.0.0.1:11434"),
        default_vat,
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PublicMeta {
    pub shop_name: String,
}

/// Public: only shop name for the login screen. No secrets.
#[tauri::command]
pub fn public_meta(db: State<'_, Db>) -> Result<PublicMeta, String> {
    let conn = db.lock();
    Ok(PublicMeta {
        shop_name: get_setting(&conn, "shop_name", "Mi Tienda"),
    })
}

#[tauri::command]
pub fn get_settings(db: State<'_, Db>, token: Option<String>) -> Result<Settings, String> {
    let conn = db.lock();
    require_session(&conn, &token)?;
    Ok(settings_from_conn(&conn))
}

#[tauri::command]
pub fn update_settings(
    db: State<'_, Db>,
    partial: Value,
    token: Option<String>,
) -> Result<Settings, String> {
    {
        let conn = db.lock();
        require_admin(&conn, &token)?;
        if let Some(v) = partial.get("shop_name").and_then(|x| x.as_str()) {
            set_setting(&conn, "shop_name", v)?;
        }
        if let Some(v) = partial.get("ollama_model").and_then(|x| x.as_str()) {
            set_setting(&conn, "ollama_model", v)?;
        }
        if let Some(v) = partial.get("ollama_url").and_then(|x| x.as_str()) {
            set_setting(&conn, "ollama_url", v)?;
        }
        if let Some(v) = partial.get("default_vat") {
            let n = if let Some(i) = v.as_i64() {
                i.to_string()
            } else if let Some(s) = v.as_str() {
                s.to_string()
            } else {
                "21".into()
            };
            set_setting(&conn, "default_vat", &n)?;
        }
    }
    get_settings(db, token)
}

#[tauri::command]
pub fn reset_demo(db: State<'_, Db>, token: Option<String>) -> Result<(), String> {
    let conn = db.lock();
    require_admin(&conn, &token)?;
    Err("Restaurar demo solo está disponible en modo navegador".into())
}

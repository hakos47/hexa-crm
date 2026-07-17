use crate::db::{
    generate_temp_password, hash_pin_public, is_temp_expired, now_iso, validate_credential,
    validate_permanent_password, verify_pin, Db,
};
use crate::models::{AuthUser, CreateUserResult, LoginResult, UserInput};
use rand::RngCore;
use rusqlite::params;
use tauri::State;

fn map_user(row: &rusqlite::Row<'_>) -> rusqlite::Result<AuthUser> {
    Ok(AuthUser {
        id: row.get(0)?,
        username: row.get(1)?,
        display_name: row.get(2)?,
        role: row.get(3)?,
        active: row.get::<_, i64>(4)? == 1,
        created_at: row.get(5)?,
        must_change_password: row.get::<_, i64>(6).unwrap_or(0) == 1,
        temp_password_issued_at: row.get::<_, Option<String>>(7)?,
    })
}

const USER_SELECT: &str = "SELECT id, username, display_name, role, active, created_at,
       COALESCE(must_change_password, 0), temp_password_issued_at FROM users";

fn random_token() -> String {
    let mut bytes = [0u8; 24];
    rand::thread_rng().fill_bytes(&mut bytes);
    hex::encode(bytes)
}

pub fn require_session(conn: &rusqlite::Connection, token: &Option<String>) -> Result<AuthUser, String> {
    let token = token
        .as_ref()
        .filter(|t| !t.is_empty())
        .ok_or_else(|| "Sesión no iniciada".to_string())?;
    conn.query_row(
        "SELECT u.id, u.username, u.display_name, u.role, u.active, u.created_at,
                COALESCE(u.must_change_password, 0), u.temp_password_issued_at
         FROM sessions s
         JOIN users u ON u.id = s.user_id
         WHERE s.token = ?1 AND u.active = 1",
        params![token],
        map_user,
    )
    .map_err(|_| "Sesión inválida o expirada".to_string())
}

pub fn require_admin(conn: &rusqlite::Connection, token: &Option<String>) -> Result<AuthUser, String> {
    let u = require_session(conn, token)?;
    if u.role != "admin" {
        return Err("Se requieren permisos de administrador".into());
    }
    Ok(u)
}

#[tauri::command]
pub fn login(
    db: State<'_, Db>,
    username: String,
    password: Option<String>,
    pin: Option<String>,
) -> Result<LoginResult, String> {
    let secret = password
        .or(pin)
        .ok_or_else(|| "Usuario o contraseña incorrectos".to_string())?;
    let conn = db.lock();
    let row: Result<
        (
            i64,
            String,
            String,
            String,
            i64,
            String,
            String,
            i64,
            Option<String>,
        ),
        _,
    > = conn.query_row(
        "SELECT id, username, display_name, role, active, created_at, pin_hash,
                COALESCE(must_change_password, 0), temp_password_issued_at
         FROM users WHERE lower(username) = lower(?1) AND active = 1",
        params![username.trim()],
        |r| {
            Ok((
                r.get(0)?,
                r.get(1)?,
                r.get(2)?,
                r.get(3)?,
                r.get(4)?,
                r.get(5)?,
                r.get(6)?,
                r.get(7)?,
                r.get(8)?,
            ))
        },
    );

    let (id, uname, display, role, active, created, pin_hash, must_change, temp_issued) =
        row.map_err(|_| "Usuario o contraseña incorrectos".to_string())?;

    if !verify_pin(secret.trim(), &pin_hash) {
        return Err("Usuario o contraseña incorrectos".into());
    }

    if must_change == 1 && is_temp_expired(&temp_issued) {
        return Err(
            "La contraseña temporal ha caducado (más de 24 h). Contacta al administrador para que genere una nueva."
                .into(),
        );
    }

    let token = random_token();
    let now = now_iso();
    conn.execute(
        "INSERT INTO sessions (token, user_id, created_at) VALUES (?1, ?2, ?3)",
        params![token, id, now],
    )
    .map_err(|e| e.to_string())?;

    Ok(LoginResult {
        user: AuthUser {
            id,
            username: uname,
            display_name: display,
            role,
            active: active == 1,
            created_at: created,
            must_change_password: must_change == 1,
            temp_password_issued_at: temp_issued,
        },
        token,
    })
}

#[tauri::command]
pub fn logout(db: State<'_, Db>, token: Option<String>) -> Result<(), String> {
    if let Some(t) = token {
        let conn = db.lock();
        conn.execute("DELETE FROM sessions WHERE token = ?1", params![t])
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn session_me(db: State<'_, Db>, token: Option<String>) -> Result<Option<AuthUser>, String> {
    let conn = db.lock();
    match require_session(&conn, &token) {
        Ok(u) => Ok(Some(u)),
        Err(_) => Ok(None),
    }
}

#[tauri::command]
pub fn list_users(db: State<'_, Db>, token: Option<String>) -> Result<Vec<AuthUser>, String> {
    let conn = db.lock();
    require_admin(&conn, &token)?;
    let mut stmt = conn
        .prepare(&format!("{USER_SELECT} ORDER BY username COLLATE NOCASE"))
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], map_user)
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    Ok(rows)
}

#[tauri::command]
pub fn upsert_user(
    db: State<'_, Db>,
    input: UserInput,
    token: Option<String>,
) -> Result<CreateUserResult, String> {
    let conn = db.lock();
    require_admin(&conn, &token)?;

    let role = if input.role == "admin" { "admin" } else { "cajero" };
    let username = input.username.trim().to_lowercase();
    if username.is_empty() {
        return Err("Usuario obligatorio".into());
    }
    let display = if input.display_name.trim().is_empty() {
        username.clone()
    } else {
        input.display_name.trim().to_string()
    };

    if let Some(id) = input.id {
        if role != "admin" {
            let other_admins: i64 = conn
                .query_row(
                    "SELECT COUNT(*) FROM users WHERE role='admin' AND active=1 AND id != ?1",
                    params![id],
                    |r| r.get(0),
                )
                .map_err(|e| e.to_string())?;
            let current_role: String = conn
                .query_row("SELECT role FROM users WHERE id=?1", params![id], |r| r.get(0))
                .map_err(|_| "Usuario no encontrado".to_string())?;
            if current_role == "admin" && other_admins == 0 {
                return Err("Debe quedar al menos un administrador".into());
            }
        }
        if input.active == Some(false) {
            let other_admins: i64 = conn
                .query_row(
                    "SELECT COUNT(*) FROM users WHERE role='admin' AND active=1 AND id != ?1",
                    params![id],
                    |r| r.get(0),
                )
                .map_err(|e| e.to_string())?;
            let current_role: String = conn
                .query_row("SELECT role FROM users WHERE id=?1", params![id], |r| r.get(0))
                .map_err(|_| "Usuario no encontrado".to_string())?;
            if current_role == "admin" && other_admins == 0 {
                return Err("No puedes desactivar el último administrador".into());
            }
        }

        let active = input.active.unwrap_or(true) as i64;
        conn.execute(
            "UPDATE users SET username=?1, display_name=?2, role=?3, active=?4 WHERE id=?5",
            params![username, display, role, active, id],
        )
        .map_err(|e| e.to_string())?;

        let mut temporary_password = None;
        if let Some(pin) = input.pin.filter(|p| !p.is_empty()) {
            if pin == "__regen_temp__" {
                let temp = generate_temp_password();
                let hash = hash_pin_public(&temp)?;
                let now = now_iso();
                conn.execute(
                    "UPDATE users SET pin_hash=?1, must_change_password=1, temp_password_issued_at=?2 WHERE id=?3",
                    params![hash, now, id],
                )
                .map_err(|e| e.to_string())?;
                temporary_password = Some(temp);
            } else {
                validate_credential(&pin)?;
                let hash = hash_pin_public(pin.trim())?;
                conn.execute(
                    "UPDATE users SET pin_hash=?1, must_change_password=0, temp_password_issued_at=NULL WHERE id=?2",
                    params![hash, id],
                )
                .map_err(|e| e.to_string())?;
            }
        }

        let user = conn
            .query_row(
                &format!("{USER_SELECT} WHERE id=?1"),
                params![id],
                map_user,
            )
            .map_err(|e| e.to_string())?;
        Ok(CreateUserResult {
            user,
            temporary_password,
        })
    } else {
        let temp = generate_temp_password();
        let hash = hash_pin_public(&temp)?;
        let now = now_iso();
        let active = input.active.unwrap_or(true) as i64;
        conn.execute(
            "INSERT INTO users (username, display_name, role, pin_hash, active, created_at, must_change_password, temp_password_issued_at)
             VALUES (?1,?2,?3,?4,?5,?6,1,?6)",
            params![username, display, role, hash, active, now],
        )
        .map_err(|e| {
            if e.to_string().contains("UNIQUE") {
                "Ese nombre de usuario ya existe".into()
            } else {
                e.to_string()
            }
        })?;
        let id = conn.last_insert_rowid();
        let user = conn
            .query_row(
                &format!("{USER_SELECT} WHERE id=?1"),
                params![id],
                map_user,
            )
            .map_err(|e| e.to_string())?;
        Ok(CreateUserResult {
            user,
            temporary_password: Some(temp),
        })
    }
}

#[tauri::command]
pub fn change_own_pin(
    db: State<'_, Db>,
    current_pin: String,
    new_pin: String,
    token: Option<String>,
) -> Result<(), String> {
    let conn = db.lock();
    let me = require_session(&conn, &token)?;
    let pin_hash: String = conn
        .query_row(
            "SELECT pin_hash FROM users WHERE id=?1",
            params![me.id],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;
    if !verify_pin(current_pin.trim(), &pin_hash) {
        return Err("Contraseña actual incorrecta".into());
    }
    validate_credential(&new_pin)?;
    let hash = hash_pin_public(new_pin.trim())?;
    conn.execute(
        "UPDATE users SET pin_hash=?1, must_change_password=0, temp_password_issued_at=NULL WHERE id=?2",
        params![hash, me.id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn complete_forced_password_change(
    db: State<'_, Db>,
    current_password: String,
    new_password: String,
    token: Option<String>,
) -> Result<AuthUser, String> {
    let conn = db.lock();
    let me = require_session(&conn, &token)?;
    if !me.must_change_password {
        return Err("No hay cambio de contraseña pendiente".into());
    }
    if is_temp_expired(&me.temp_password_issued_at) {
        return Err("La contraseña temporal ha caducado. Contacta al administrador.".into());
    }
    let pin_hash: String = conn
        .query_row(
            "SELECT pin_hash FROM users WHERE id=?1",
            params![me.id],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;
    if !verify_pin(current_password.trim(), &pin_hash) {
        return Err("Contraseña temporal incorrecta".into());
    }
    validate_permanent_password(&new_password)?;
    if new_password.trim() == current_password.trim() {
        return Err("La nueva contraseña debe ser distinta a la temporal".into());
    }
    let hash = hash_pin_public(new_password.trim())?;
    conn.execute(
        "UPDATE users SET pin_hash=?1, must_change_password=0, temp_password_issued_at=NULL WHERE id=?2",
        params![hash, me.id],
    )
    .map_err(|e| e.to_string())?;
    conn.query_row(
        &format!("{USER_SELECT} WHERE id=?1"),
        params![me.id],
        map_user,
    )
    .map_err(|e| e.to_string())
}

use crate::commands::auth::require_session;
use crate::db::{now_iso, Db};
use crate::models::{Customer, CustomerInput};
use rusqlite::params;
use tauri::State;

fn map_customer(row: &rusqlite::Row<'_>) -> rusqlite::Result<Customer> {
    Ok(Customer {
        id: row.get(0)?,
        name: row.get(1)?,
        email: row.get(2)?,
        phone: row.get(3)?,
        nif: row.get(4)?,
        notes: row.get(5)?,
        created_at: row.get(6)?,
    })
}

#[tauri::command]
pub fn list_customers(db: State<'_, Db>, token: Option<String>) -> Result<Vec<Customer>, String> {
    let conn = db.lock();
    require_session(&conn, &token)?;
    let mut stmt = conn
        .prepare(
            "SELECT id, name, email, phone, nif, notes, created_at FROM customers ORDER BY name COLLATE NOCASE",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], map_customer)
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    Ok(rows)
}

#[tauri::command]
pub fn upsert_customer(
    db: State<'_, Db>,
    input: CustomerInput,
    token: Option<String>,
) -> Result<Customer, String> {
    let conn = db.lock();
    require_session(&conn, &token)?;
    let email = input.email.unwrap_or_default();
    let phone = input.phone.unwrap_or_default();
    let nif = input.nif.unwrap_or_default();
    let notes = input.notes.unwrap_or_default();

    if let Some(id) = input.id {
        conn.execute(
            "UPDATE customers SET name=?1, email=?2, phone=?3, nif=?4, notes=?5 WHERE id=?6",
            params![input.name, email, phone, nif, notes, id],
        )
        .map_err(|e| e.to_string())?;
        conn.query_row(
            "SELECT id, name, email, phone, nif, notes, created_at FROM customers WHERE id=?1",
            params![id],
            map_customer,
        )
        .map_err(|e| e.to_string())
    } else {
        let now = now_iso();
        conn.execute(
            "INSERT INTO customers (name, email, phone, nif, notes, created_at) VALUES (?1,?2,?3,?4,?5,?6)",
            params![input.name, email, phone, nif, notes, now],
        )
        .map_err(|e| e.to_string())?;
        let id = conn.last_insert_rowid();
        conn.query_row(
            "SELECT id, name, email, phone, nif, notes, created_at FROM customers WHERE id=?1",
            params![id],
            map_customer,
        )
        .map_err(|e| e.to_string())
    }
}

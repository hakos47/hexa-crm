use crate::commands::auth::require_session;
use crate::db::{now_iso, Db};
use crate::models::{CashInput, CashMovement};
use rusqlite::params;
use tauri::State;

fn map_cash(row: &rusqlite::Row<'_>) -> rusqlite::Result<CashMovement> {
    Ok(CashMovement {
        id: row.get(0)?,
        kind: row.get(1)?,
        amount_cents: row.get(2)?,
        category: row.get(3)?,
        description: row.get(4)?,
        sale_id: row.get(5)?,
        occurred_at: row.get(6)?,
    })
}

#[tauri::command]
pub fn list_cash_movements(
    db: State<'_, Db>,
    token: Option<String>,
) -> Result<Vec<CashMovement>, String> {
    let conn = db.lock();
    require_session(&conn, &token)?;
    let mut stmt = conn
        .prepare(
            "SELECT id, kind, amount_cents, category, description, sale_id, occurred_at
             FROM cash_movements ORDER BY occurred_at DESC",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], map_cash)
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    Ok(rows)
}

#[tauri::command]
pub fn create_cash_movement(
    db: State<'_, Db>,
    input: CashInput,
    token: Option<String>,
) -> Result<CashMovement, String> {
    let kind = input.kind.as_str();
    if !matches!(kind, "income" | "expense" | "adjustment") {
        return Err("Tipo de movimiento no válido".into());
    }
    if input.amount_cents <= 0 {
        return Err("Importe no válido".into());
    }
    let conn = db.lock();
    require_session(&conn, &token)?;
    let occurred = input
        .occurred_at
        .filter(|s| !s.is_empty())
        .unwrap_or_else(now_iso);
    let desc = input.description.unwrap_or_default();
    conn.execute(
        "INSERT INTO cash_movements (kind, amount_cents, category, description, sale_id, occurred_at)
         VALUES (?1,?2,?3,?4,NULL,?5)",
        params![input.kind, input.amount_cents, input.category, desc, occurred],
    )
    .map_err(|e| e.to_string())?;
    let id = conn.last_insert_rowid();
    conn.query_row(
        "SELECT id, kind, amount_cents, category, description, sale_id, occurred_at FROM cash_movements WHERE id=?1",
        params![id],
        map_cash,
    )
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_cash_balance(db: State<'_, Db>, token: Option<String>) -> Result<i64, String> {
    let conn = db.lock();
    require_session(&conn, &token)?;
    let balance: i64 = conn
        .query_row(
            "SELECT COALESCE(SUM(
                CASE
                  WHEN kind = 'expense' THEN -ABS(amount_cents)
                  ELSE ABS(amount_cents)
                END
             ), 0) FROM cash_movements",
            [],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;
    Ok(balance)
}

use crate::commands::auth::require_session;
use crate::db::{now_iso, valid_vat, Db};
use crate::models::{Product, ProductInput};
use rusqlite::params;
use tauri::State;

fn map_product(row: &rusqlite::Row<'_>) -> rusqlite::Result<Product> {
    Ok(Product {
        id: row.get(0)?,
        sku: row.get(1)?,
        name: row.get(2)?,
        description: row.get(3)?,
        stock: row.get(4)?,
        min_stock: row.get(5)?,
        cost_cents: row.get(6)?,
        price_cents: row.get(7)?,
        vat_rate: row.get(8)?,
        active: row.get::<_, i64>(9)? == 1,
        created_at: row.get(10)?,
        updated_at: row.get(11)?,
    })
}

#[tauri::command]
pub fn list_products(
    db: State<'_, Db>,
    active_only: Option<bool>,
    token: Option<String>,
) -> Result<Vec<Product>, String> {
    let conn = db.lock();
    require_session(&conn, &token)?;
    let only = active_only.unwrap_or(true);
    let sql = if only {
        "SELECT id, sku, name, description, stock, min_stock, cost_cents, price_cents, vat_rate, active, created_at, updated_at
         FROM products WHERE active = 1 ORDER BY name COLLATE NOCASE"
    } else {
        "SELECT id, sku, name, description, stock, min_stock, cost_cents, price_cents, vat_rate, active, created_at, updated_at
         FROM products ORDER BY name COLLATE NOCASE"
    };
    let mut stmt = conn.prepare(sql).map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], map_product)
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    Ok(rows)
}

#[tauri::command]
pub fn upsert_product(
    db: State<'_, Db>,
    input: ProductInput,
    token: Option<String>,
) -> Result<Product, String> {
    if !valid_vat(input.vat_rate) {
        return Err("Tipo de IVA no válido".into());
    }
    let conn = db.lock();
    require_session(&conn, &token)?;
    let now = now_iso();
    let desc = input.description.unwrap_or_default();
    let active = input.active.unwrap_or(true) as i64;

    if let Some(id) = input.id {
        conn.execute(
            "UPDATE products SET sku=?1, name=?2, description=?3, stock=COALESCE(?4, stock), min_stock=COALESCE(?5, min_stock),
             cost_cents=?6, price_cents=?7, vat_rate=?8, active=?9, updated_at=?10 WHERE id=?11",
            params![
                input.sku,
                input.name,
                desc,
                input.stock,
                input.min_stock,
                input.cost_cents,
                input.price_cents,
                input.vat_rate,
                active,
                now,
                id
            ],
        )
        .map_err(|e| e.to_string())?;
        conn.query_row(
            "SELECT id, sku, name, description, stock, min_stock, cost_cents, price_cents, vat_rate, active, created_at, updated_at FROM products WHERE id=?1",
            params![id],
            map_product,
        )
        .map_err(|e| e.to_string())
    } else {
        conn.execute(
            "INSERT INTO products (sku, name, description, stock, min_stock, cost_cents, price_cents, vat_rate, active, created_at, updated_at)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?10)",
            params![
                input.sku,
                input.name,
                desc,
                input.stock.unwrap_or(0),
                input.min_stock.unwrap_or(0),
                input.cost_cents,
                input.price_cents,
                input.vat_rate,
                active,
                now
            ],
        )
        .map_err(|e| e.to_string())?;
        let id = conn.last_insert_rowid();
        conn.query_row(
            "SELECT id, sku, name, description, stock, min_stock, cost_cents, price_cents, vat_rate, active, created_at, updated_at FROM products WHERE id=?1",
            params![id],
            map_product,
        )
        .map_err(|e| e.to_string())
    }
}

#[tauri::command]
pub fn adjust_stock(
    db: State<'_, Db>,
    product_id: i64,
    delta: i64,
    reason: String,
    token: Option<String>,
) -> Result<Product, String> {
    let conn = db.lock();
    require_session(&conn, &token)?;
    let now = now_iso();
    let tx = conn.unchecked_transaction().map_err(|e| e.to_string())?;
    tx.execute(
        "UPDATE products SET stock = stock + ?1, updated_at = ?2 WHERE id = ?3",
        params![delta, now, product_id],
    )
    .map_err(|e| e.to_string())?;
    tx.execute(
        "INSERT INTO stock_movements (product_id, delta, reason, created_at) VALUES (?1,?2,?3,?4)",
        params![product_id, delta, reason, now],
    )
    .map_err(|e| e.to_string())?;
    tx.commit().map_err(|e| e.to_string())?;

    conn.query_row(
        "SELECT id, sku, name, description, stock, min_stock, cost_cents, price_cents, vat_rate, active, created_at, updated_at FROM products WHERE id=?1",
        params![product_id],
        map_product,
    )
    .map_err(|e| e.to_string())
}

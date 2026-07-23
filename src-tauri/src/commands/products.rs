use crate::commands::auth::require_session;
use crate::db::{now_iso, valid_vat, Db};
use crate::models::{Product, ProductInput};
use rusqlite::params;
use tauri::State;

const PRODUCT_COLS: &str = "id, sku, name, description, COALESCE(category,''), stock, min_stock, cost_cents, price_cents, vat_rate, COALESCE(supplier_name,''), COALESCE(supplier_contact,''), COALESCE(supplier_email,''), COALESCE(supplier_phone,''), COALESCE(fulfillment_mode,'own_stock'), COALESCE(stock_location,'Almacén principal'), COALESCE(condition_code,'used'), active, created_at, updated_at";

fn map_product(row: &rusqlite::Row<'_>) -> rusqlite::Result<Product> {
    Ok(Product {
        id: row.get(0)?,
        sku: row.get(1)?,
        name: row.get(2)?,
        description: row.get(3)?,
        category: row.get(4)?,
        stock: row.get(5)?,
        min_stock: row.get(6)?,
        cost_cents: row.get(7)?,
        price_cents: row.get(8)?,
        vat_rate: row.get(9)?,
        supplier_name: row.get(10)?,
        supplier_contact: row.get(11)?,
        supplier_email: row.get(12)?,
        supplier_phone: row.get(13)?,
        fulfillment_mode: row.get(14)?,
        stock_location: row.get(15)?,
        condition_code: row.get(16)?,
        active: row.get::<_, i64>(17)? == 1,
        created_at: row.get(18)?,
        updated_at: row.get(19)?,
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
        format!("SELECT {PRODUCT_COLS} FROM products WHERE active = 1 ORDER BY name COLLATE NOCASE")
    } else {
        format!("SELECT {PRODUCT_COLS} FROM products ORDER BY name COLLATE NOCASE")
    };
    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
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
    let category = input.category.unwrap_or_default();
    let supplier_name = input.supplier_name.unwrap_or_default();
    let supplier_contact = input.supplier_contact.unwrap_or_default();
    let supplier_email = input.supplier_email.unwrap_or_default();
    let supplier_phone = input.supplier_phone.unwrap_or_default();
    let fulfillment_mode = input.fulfillment_mode.unwrap_or_else(|| "own_stock".into());
    let stock_location = input.stock_location.unwrap_or_else(|| "Almacén principal".into());
    let condition_code = input.condition_code.unwrap_or_else(|| "used".into());
    let active = input.active.unwrap_or(true) as i64;

    if let Some(id) = input.id {
        conn.execute(
            "UPDATE products SET sku=?1, name=?2, description=?3, category=?4, stock=COALESCE(?5, stock), min_stock=COALESCE(?6, min_stock),
             cost_cents=?7, price_cents=?8, vat_rate=?9, supplier_name=?10, supplier_contact=?11, supplier_email=?12, supplier_phone=?13, fulfillment_mode=?14, stock_location=?15, condition_code=?16, active=?17, updated_at=?18 WHERE id=?19",
            params![
                input.sku,
                input.name,
                desc,
                category,
                input.stock,
                input.min_stock,
                input.cost_cents,
                input.price_cents,
                input.vat_rate,
                supplier_name,
                supplier_contact,
                supplier_email,
                supplier_phone,
                fulfillment_mode,
                stock_location,
                condition_code,
                active,
                now,
                id
            ],
        )
        .map_err(|e| e.to_string())?;
        conn.query_row(
            &format!("SELECT {PRODUCT_COLS} FROM products WHERE id=?1"),
            params![id],
            map_product,
        )
        .map_err(|e| e.to_string())
    } else {
        conn.execute(
            "INSERT INTO products (sku, name, description, category, stock, min_stock, cost_cents, price_cents, vat_rate, supplier_name, supplier_contact, supplier_email, supplier_phone, fulfillment_mode, stock_location, condition_code, active, created_at, updated_at)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18,?18)",
            params![
                input.sku,
                input.name,
                desc,
                category,
                input.stock.unwrap_or(0),
                input.min_stock.unwrap_or(0),
                input.cost_cents,
                input.price_cents,
                input.vat_rate,
                supplier_name,
                supplier_contact,
                supplier_email,
                supplier_phone,
                fulfillment_mode,
                stock_location,
                condition_code,
                active,
                now
            ],
        )
        .map_err(|e| e.to_string())?;
        let id = conn.last_insert_rowid();
        conn.query_row(
            &format!("SELECT {PRODUCT_COLS} FROM products WHERE id=?1"),
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
        &format!("SELECT {PRODUCT_COLS} FROM products WHERE id=?1"),
        params![product_id],
        map_product,
    )
    .map_err(|e| e.to_string())
}

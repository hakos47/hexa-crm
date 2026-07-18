use crate::commands::auth::require_session;
use crate::db::{now_iso, split_inclusive, Db};
use crate::models::{Sale, SaleLine, SaleLineInput};
use rusqlite::params;
use tauri::State;

#[tauri::command]
pub fn create_sale(
    db: State<'_, Db>,
    lines: Vec<SaleLineInput>,
    customer_id: Option<i64>,
    notes: Option<String>,
    token: Option<String>,
) -> Result<Sale, String> {
    if lines.is_empty() {
        return Err("La venta no tiene líneas".into());
    }

    let conn = db.lock();
    require_session(&conn, &token)?;
    let now = now_iso();
    let tx = conn.unchecked_transaction().map_err(|e| e.to_string())?;

    let mut subtotal = 0i64;
    let mut vat = 0i64;
    let mut total = 0i64;
    let mut built: Vec<(i64, i64, i64, i32, i64, i64, i64, String)> = Vec::new();
    // product_id, qty, unit, rate, base, vat, line_total, name

    for line in &lines {
        if line.qty <= 0 {
            return Err("Cantidad no válida".into());
        }
        let (name, stock, price, rate, active): (String, i64, i64, i32, i64) = tx
            .query_row(
                "SELECT name, stock, price_cents, vat_rate, active FROM products WHERE id=?1",
                params![line.product_id],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?)),
            )
            .map_err(|_| "Producto no válido".to_string())?;
        if active != 1 {
            return Err(format!("Producto inactivo: {name}"));
        }
        if stock < line.qty {
            return Err(format!("Stock insuficiente de {name}"));
        }
        let unit = line.unit_price_cents.unwrap_or(price);
        let discount = line.discount_cents.unwrap_or(0);
        let line_total = (unit * line.qty - discount).max(0);
        let (base, v) = split_inclusive(line_total, rate);
        subtotal += base;
        vat += v;
        total += line_total;
        built.push((line.product_id, line.qty, unit, rate, base, v, line_total, name));
    }

    // provisional number based on max id
    let next_id: i64 = tx
        .query_row("SELECT COALESCE(MAX(id), 0) + 1 FROM sales", [], |r| r.get(0))
        .map_err(|e| e.to_string())?;
    let number = format!("T-{next_id:05}");
    let notes = notes.unwrap_or_default();

    tx.execute(
        "INSERT INTO sales (customer_id, number, sold_at, subtotal_cents, vat_cents, total_cents, notes, status)
         VALUES (?1,?2,?3,?4,?5,?6,?7,'completed')",
        params![customer_id, number, now, subtotal, vat, total, notes],
    )
    .map_err(|e| e.to_string())?;
    let sale_id = tx.last_insert_rowid();

    let mut sale_lines = Vec::new();
    for (product_id, qty, unit, rate, base, v, line_total, name) in &built {
        tx.execute(
            "INSERT INTO sale_lines (sale_id, product_id, qty, unit_price_cents, vat_rate, line_base_cents, line_vat_cents, line_total_cents)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8)",
            params![sale_id, product_id, qty, unit, rate, base, v, line_total],
        )
        .map_err(|e| e.to_string())?;
        let line_id = tx.last_insert_rowid();
        tx.execute(
            "UPDATE products SET stock = stock - ?1, updated_at = ?2 WHERE id = ?3",
            params![qty, now, product_id],
        )
        .map_err(|e| e.to_string())?;
        tx.execute(
            "INSERT INTO stock_movements (product_id, delta, reason, ref_type, ref_id, created_at)
             VALUES (?1,?2,?3,'sale',?4,?5)",
            params![product_id, -qty, format!("Venta {number}"), sale_id, now],
        )
        .map_err(|e| e.to_string())?;
        sale_lines.push(SaleLine {
            id: line_id,
            sale_id,
            product_id: *product_id,
            product_name: Some(name.clone()),
            qty: *qty,
            unit_price_cents: *unit,
            vat_rate: *rate,
            line_base_cents: *base,
            line_vat_cents: *v,
            line_total_cents: *line_total,
        });
    }

    tx.execute(
        "INSERT INTO cash_movements (kind, amount_cents, category, description, sale_id, occurred_at)
         VALUES ('income', ?1, 'ventas', ?2, ?3, ?4)",
        params![total, format!("Venta {number}"), sale_id, now],
    )
    .map_err(|e| e.to_string())?;

    tx.commit().map_err(|e| e.to_string())?;

    let customer_name: Option<String> = if let Some(cid) = customer_id {
        conn.query_row(
            "SELECT name FROM customers WHERE id=?1",
            params![cid],
            |r| r.get(0),
        )
        .ok()
    } else {
        None
    };

    Ok(Sale {
        id: sale_id,
        customer_id,
        customer_name,
        number,
        sold_at: now,
        subtotal_cents: subtotal,
        vat_cents: vat,
        total_cents: total,
        notes,
        status: "completed".into(),
        lines: Some(sale_lines),
    })
}

#[tauri::command]
pub fn list_sales(db: State<'_, Db>, token: Option<String>) -> Result<Vec<Sale>, String> {
    let conn = db.lock();
    require_session(&conn, &token)?;
    let mut stmt = conn
        .prepare(
            "SELECT s.id, s.customer_id, c.name, s.number, s.sold_at, s.subtotal_cents, s.vat_cents, s.total_cents, s.notes, s.status
             FROM sales s LEFT JOIN customers c ON c.id = s.customer_id
             ORDER BY s.sold_at DESC",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |r| {
            Ok(Sale {
                id: r.get(0)?,
                customer_id: r.get(1)?,
                customer_name: r.get(2)?,
                number: r.get(3)?,
                sold_at: r.get(4)?,
                subtotal_cents: r.get(5)?,
                vat_cents: r.get(6)?,
                total_cents: r.get(7)?,
                notes: r.get(8)?,
                status: r.get(9)?,
                lines: None,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    Ok(rows)
}

#[tauri::command]
pub fn get_sale(db: State<'_, Db>, id: i64, token: Option<String>) -> Result<Sale, String> {
    let conn = db.lock();
    require_session(&conn, &token)?;
    let mut sale = conn
        .query_row(
            "SELECT s.id, s.customer_id, c.name, s.number, s.sold_at, s.subtotal_cents, s.vat_cents, s.total_cents, s.notes, s.status
             FROM sales s LEFT JOIN customers c ON c.id = s.customer_id WHERE s.id=?1",
            params![id],
            |r| {
                Ok(Sale {
                    id: r.get(0)?,
                    customer_id: r.get(1)?,
                    customer_name: r.get(2)?,
                    number: r.get(3)?,
                    sold_at: r.get(4)?,
                    subtotal_cents: r.get(5)?,
                    vat_cents: r.get(6)?,
                    total_cents: r.get(7)?,
                    notes: r.get(8)?,
                    status: r.get(9)?,
                    lines: None,
                })
            },
        )
        .map_err(|_| "Venta no encontrada".to_string())?;

    let mut stmt = conn
        .prepare(
            "SELECT l.id, l.sale_id, l.product_id, p.name, l.qty, l.unit_price_cents, l.vat_rate,
                    l.line_base_cents, l.line_vat_cents, l.line_total_cents
             FROM sale_lines l JOIN products p ON p.id = l.product_id WHERE l.sale_id=?1",
        )
        .map_err(|e| e.to_string())?;
    let lines = stmt
        .query_map(params![id], |r| {
            Ok(SaleLine {
                id: r.get(0)?,
                sale_id: r.get(1)?,
                product_id: r.get(2)?,
                product_name: r.get(3)?,
                qty: r.get(4)?,
                unit_price_cents: r.get(5)?,
                vat_rate: r.get(6)?,
                line_base_cents: r.get(7)?,
                line_vat_cents: r.get(8)?,
                line_total_cents: r.get(9)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    sale.lines = Some(lines);
    Ok(sale)
}

#[tauri::command]
pub fn cancel_sale(db: State<'_, Db>, id: i64, token: Option<String>) -> Result<Sale, String> {
    let conn = db.lock();
    require_session(&conn, &token)?;
    let now = now_iso();
    let tx = conn.unchecked_transaction().map_err(|e| e.to_string())?;

    let (number, status, total): (String, String, i64) = tx
        .query_row(
            "SELECT number, status, total_cents FROM sales WHERE id=?1",
            params![id],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
        )
        .map_err(|_| "Venta no encontrada".to_string())?;

    if status == "cancelled" {
        return Err("La venta ya está anulada".into());
    }
    if status != "completed" {
        return Err(format!("No se puede anular una venta en estado \"{status}\""));
    }

    let mut lines_stmt = tx
        .prepare("SELECT product_id, qty FROM sale_lines WHERE sale_id=?1")
        .map_err(|e| e.to_string())?;
    let restores: Vec<(i64, i64)> = lines_stmt
        .query_map(params![id], |r| Ok((r.get(0)?, r.get(1)?)))
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    drop(lines_stmt);

    if restores.is_empty() {
        return Err("La venta no tiene líneas para restaurar".into());
    }

    tx.execute(
        "UPDATE sales SET status='cancelled' WHERE id=?1",
        params![id],
    )
    .map_err(|e| e.to_string())?;

    for (product_id, qty) in &restores {
        tx.execute(
            "UPDATE products SET stock = stock + ?1, updated_at = ?2 WHERE id = ?3",
            params![qty, now, product_id],
        )
        .map_err(|e| e.to_string())?;
        tx.execute(
            "INSERT INTO stock_movements (product_id, delta, reason, ref_type, ref_id, created_at)
             VALUES (?1,?2,?3,'cancel',?4,?5)",
            params![product_id, qty, format!("Anulación {number}"), id, now],
        )
        .map_err(|e| e.to_string())?;
    }

    tx.execute(
        "INSERT INTO cash_movements (kind, amount_cents, category, description, sale_id, occurred_at)
         VALUES ('expense', ?1, 'anulaciones', ?2, ?3, ?4)",
        params![total.abs(), format!("Anulación {number}"), id, now],
    )
    .map_err(|e| e.to_string())?;

    tx.commit().map_err(|e| e.to_string())?;
    drop(conn);

    get_sale(db, id, token)
}

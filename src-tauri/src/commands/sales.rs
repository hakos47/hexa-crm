use crate::commands::auth::require_session;
use crate::db::{now_iso, split_inclusive, Db};
use crate::models::{ReturnLineInput, Sale, SaleLine, SaleLineInput};
use rusqlite::params;
use tauri::State;

type BuiltSaleLine = (i64, i64, i64, i32, i64, i64, i64, String);

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
    let mut built: Vec<BuiltSaleLine> = Vec::new();
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
        built.push((
            line.product_id,
            line.qty,
            unit,
            rate,
            base,
            v,
            line_total,
            name,
        ));
    }

    // provisional number based on max id
    let next_id: i64 = tx
        .query_row("SELECT COALESCE(MAX(id), 0) + 1 FROM sales", [], |r| {
            r.get(0)
        })
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
            returned_qty: 0,
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
        refunded_cents: 0,
        lines: Some(sale_lines),
    })
}

#[tauri::command]
pub fn list_sales(db: State<'_, Db>, token: Option<String>) -> Result<Vec<Sale>, String> {
    let conn = db.lock();
    require_session(&conn, &token)?;
    let mut stmt = conn
        .prepare(
            "SELECT s.id, s.customer_id, c.name, s.number, s.sold_at, s.subtotal_cents, s.vat_cents, s.total_cents, s.notes, s.status, s.refunded_cents
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
                refunded_cents: r.get(10)?,
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
            "SELECT s.id, s.customer_id, c.name, s.number, s.sold_at, s.subtotal_cents, s.vat_cents, s.total_cents, s.notes, s.status, s.refunded_cents
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
                    refunded_cents: r.get(10)?,
                    lines: None,
                })
            },
        )
        .map_err(|_| "Venta no encontrada".to_string())?;

    let mut stmt = conn
        .prepare(
            "SELECT l.id, l.sale_id, l.product_id, p.name, l.qty, l.unit_price_cents, l.vat_rate,
                    l.line_base_cents, l.line_vat_cents, l.line_total_cents, l.returned_qty
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
                returned_qty: r.get(10)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    sale.lines = Some(lines);
    Ok(sale)
}

fn proportional_cents(total_cents: i64, total_units: i64, already_taken: i64, take: i64) -> i64 {
    if take <= 0 || total_units <= 0 {
        return 0;
    }
    if already_taken + take >= total_units {
        return (total_cents - proportional_cents(total_cents, total_units, 0, already_taken))
            .max(0);
    }
    (total_cents / total_units) * take
}

#[tauri::command]
pub fn return_sale_lines(
    db: State<'_, Db>,
    id: i64,
    lines: Vec<ReturnLineInput>,
    token: Option<String>,
) -> Result<Sale, String> {
    if lines.is_empty() {
        return Err("Indica al menos una línea y cantidad a devolver".into());
    }

    let conn = db.lock();
    require_session(&conn, &token)?;
    let now = now_iso();
    let tx = conn.unchecked_transaction().map_err(|e| e.to_string())?;
    let (number, status, refunded_cents): (String, String, i64) = tx
        .query_row(
            "SELECT number, status, refunded_cents FROM sales WHERE id=?1",
            params![id],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
        )
        .map_err(|_| "Venta no encontrada".to_string())?;
    if status == "cancelled" {
        return Err("La venta ya está anulada".into());
    }
    if status != "completed" && status != "partially_returned" {
        return Err(format!(
            "No se puede devolver una venta en estado \"{status}\""
        ));
    }

    let mut seen = std::collections::HashSet::new();
    let mut refunds = 0i64;
    for request in &lines {
        if request.qty <= 0 {
            return Err("La cantidad a devolver debe ser un entero positivo".into());
        }
        if !seen.insert(request.line_id) {
            return Err("Línea duplicada en la solicitud de devolución".into());
        }
        let (product_id, qty, returned_qty, line_total): (i64, i64, i64, i64) = tx
            .query_row(
                "SELECT product_id, qty, returned_qty, line_total_cents FROM sale_lines WHERE id=?1 AND sale_id=?2",
                params![request.line_id, id],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)),
            )
            .map_err(|_| format!("Línea {} no pertenece a esta venta", request.line_id))?;
        let remaining = (qty - returned_qty).max(0);
        if request.qty > remaining {
            return Err(format!(
                "Solo quedan {remaining} ud. por devolver en la línea {}",
                request.line_id
            ));
        }
        let refund = proportional_cents(line_total, qty, returned_qty, request.qty);
        refunds += refund;
        tx.execute(
            "UPDATE sale_lines SET returned_qty=?1 WHERE id=?2",
            params![returned_qty + request.qty, request.line_id],
        )
        .map_err(|e| e.to_string())?;
        tx.execute(
            "UPDATE products SET stock=stock + ?1, updated_at=?2 WHERE id=?3",
            params![request.qty, now, product_id],
        )
        .map_err(|e| e.to_string())?;
        tx.execute(
            "INSERT INTO stock_movements (product_id, delta, reason, ref_type, ref_id, created_at)
             VALUES (?1,?2,?3,'return',?4,?5)",
            params![
                product_id,
                request.qty,
                format!("Devolución {number}"),
                id,
                now
            ],
        )
        .map_err(|e| e.to_string())?;
    }

    let still_remaining: i64 = tx
        .query_row(
            "SELECT COUNT(*) FROM sale_lines WHERE sale_id=?1 AND returned_qty < qty",
            params![id],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;
    let all_back = still_remaining == 0;
    let next_status = if all_back {
        "cancelled"
    } else {
        "partially_returned"
    };
    let next_refunded = refunded_cents + refunds;
    tx.execute(
        "UPDATE sales SET status=?1, refunded_cents=?2 WHERE id=?3",
        params![next_status, next_refunded, id],
    )
    .map_err(|e| e.to_string())?;
    tx.execute(
        "INSERT INTO cash_movements (kind, amount_cents, category, description, sale_id, occurred_at)
         VALUES ('expense',?1,'devoluciones',?2,?3,?4)",
        params![refunds, if all_back { format!("Devolución total {number}") } else { format!("Devolución parcial {number}") }, id, now],
    ).map_err(|e| e.to_string())?;
    tx.commit().map_err(|e| e.to_string())?;
    drop(conn);
    get_sale(db, id, token)
}

#[tauri::command]
pub fn cancel_sale(db: State<'_, Db>, id: i64, token: Option<String>) -> Result<Sale, String> {
    let conn = db.lock();
    require_session(&conn, &token)?;
    let now = now_iso();
    let tx = conn.unchecked_transaction().map_err(|e| e.to_string())?;

    let (number, status, total, refunded_cents): (String, String, i64, i64) = tx
        .query_row(
            "SELECT number, status, total_cents, refunded_cents FROM sales WHERE id=?1",
            params![id],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)),
        )
        .map_err(|_| "Venta no encontrada".to_string())?;

    if status == "cancelled" {
        return Err("La venta ya está anulada".into());
    }
    if status != "completed" && status != "partially_returned" {
        return Err(format!(
            "No se puede anular una venta en estado \"{status}\""
        ));
    }

    let mut lines_stmt = tx
        .prepare("SELECT product_id, qty - returned_qty FROM sale_lines WHERE sale_id=?1 AND returned_qty < qty")
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
        "UPDATE sales SET status='cancelled', refunded_cents=?1 WHERE id=?2",
        params![total, id],
    )
    .map_err(|e| e.to_string())?;
    tx.execute(
        "UPDATE sale_lines SET returned_qty=qty WHERE sale_id=?1",
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
        params![(total - refunded_cents).abs(), format!("Anulación {number}"), id, now],
    )
    .map_err(|e| e.to_string())?;

    tx.commit().map_err(|e| e.to_string())?;
    drop(conn);

    get_sale(db, id, token)
}

#[cfg(test)]
mod tests {
    use super::proportional_cents;

    #[test]
    fn assigns_rounding_remainder_to_the_final_returned_unit() {
        assert_eq!(proportional_cents(1_000, 3, 0, 1), 333);
        assert_eq!(proportional_cents(1_000, 3, 1, 1), 333);
        assert_eq!(proportional_cents(1_000, 3, 2, 1), 334);
    }
}

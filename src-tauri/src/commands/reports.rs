use crate::commands::auth::require_session;
use crate::db::Db;
use crate::models::{DashboardStats, Product, VatBucket, VatSummary};
use rusqlite::params;
use tauri::State;

#[tauri::command]
pub fn vat_summary(
    db: State<'_, Db>,
    from: String,
    to: String,
    token: Option<String>,
) -> Result<VatSummary, String> {
    let conn = db.lock();
    require_session(&conn, &token)?;
    let rates = [0, 4, 10, 21];
    let mut buckets = Vec::new();
    let mut base_total = 0i64;
    let mut vat_total = 0i64;
    let mut grand = 0i64;

    for rate in rates {
        let (base, vat, total): (i64, i64, i64) = conn
            .query_row(
                "SELECT
                    COALESCE(SUM(l.line_base_cents), 0),
                    COALESCE(SUM(l.line_vat_cents), 0),
                    COALESCE(SUM(l.line_total_cents), 0)
                 FROM sale_lines l
                 JOIN sales s ON s.id = l.sale_id
                 WHERE l.vat_rate = ?1
                   AND s.status = 'completed'
                   AND substr(s.sold_at, 1, 10) >= ?2
                   AND substr(s.sold_at, 1, 10) <= ?3",
                params![rate, from, to],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
            )
            .map_err(|e| e.to_string())?;
        base_total += base;
        vat_total += vat;
        grand += total;
        buckets.push(VatBucket {
            vat_rate: rate,
            base_cents: base,
            vat_cents: vat,
            total_cents: total,
        });
    }

    Ok(VatSummary {
        from,
        to,
        buckets,
        base_cents: base_total,
        vat_cents: vat_total,
        total_cents: grand,
    })
}

#[tauri::command]
pub fn dashboard_stats(db: State<'_, Db>, token: Option<String>) -> Result<DashboardStats, String> {
    let conn = db.lock();
    require_session(&conn, &token)?;
    let today = chrono::Local::now().format("%Y-%m-%d").to_string();
    let month = chrono::Local::now().format("%Y-%m").to_string();

    let (sales_today_cents, sales_today_count): (i64, i64) = conn
        .query_row(
            "SELECT COALESCE(SUM(total_cents),0), COUNT(*) FROM sales
             WHERE substr(sold_at,1,10)=?1 AND status='completed'",
            params![today],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .map_err(|e| e.to_string())?;

    let (sales_month_cents, sales_month_count, vat_month_cents, base_month_cents): (i64, i64, i64, i64) =
        conn.query_row(
            "SELECT COALESCE(SUM(total_cents),0), COUNT(*), COALESCE(SUM(vat_cents),0), COALESCE(SUM(subtotal_cents),0)
             FROM sales WHERE substr(sold_at,1,7)=?1 AND status='completed'",
            params![month],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)),
        )
        .map_err(|e| e.to_string())?;

    let cash_balance_cents: i64 = conn
        .query_row(
            "SELECT COALESCE(SUM(
                CASE WHEN kind='expense' THEN -ABS(amount_cents) ELSE ABS(amount_cents) END
             ),0) FROM cash_movements",
            [],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;

    let mut stmt = conn
        .prepare(
            "SELECT id, sku, name, description, COALESCE(category,''), stock, min_stock, cost_cents, price_cents, vat_rate, COALESCE(supplier_name,''), COALESCE(supplier_contact,''), COALESCE(supplier_email,''), COALESCE(supplier_phone,''), COALESCE(fulfillment_mode,'own_stock'), COALESCE(stock_location,'Almacén principal'), COALESCE(condition_code,'used'), active, created_at, updated_at
             FROM products WHERE active=1 AND stock <= min_stock ORDER BY stock ASC",
        )
        .map_err(|e| e.to_string())?;
    let low_stock = stmt
        .query_map([], |row| {
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
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    Ok(DashboardStats {
        sales_today_cents,
        sales_month_cents,
        sales_today_count,
        sales_month_count,
        cash_balance_cents,
        low_stock,
        vat_month_cents,
        base_month_cents,
    })
}

use crate::commands::auth::require_session;
use crate::commands::settings::settings_from_conn;
use crate::db::Db;
use crate::models::{AiChatResult, AiMessage, OllamaHealth};
use serde_json::{json, Value};
use tauri::State;

#[tauri::command]
pub fn ollama_health(db: State<'_, Db>, token: Option<String>) -> Result<OllamaHealth, String> {
    let conn = db.lock();
    require_session(&conn, &token)?;
    let settings = settings_from_conn(&conn);
    drop(conn);

    let url = format!("{}/api/tags", settings.ollama_url.trim_end_matches('/'));
    let client = reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(3))
        .build()
        .map_err(|e| e.to_string())?;
    match client.get(&url).send() {
        Ok(res) if res.status().is_success() => {
            let data: Value = res.json().unwrap_or(json!({}));
            let models = data
                .get("models")
                .and_then(|m| m.as_array())
                .map(|arr| {
                    arr.iter()
                        .filter_map(|m| m.get("name").and_then(|n| n.as_str()).map(str::to_string))
                        .collect()
                })
                .unwrap_or_default();
            Ok(OllamaHealth { ok: true, models })
        }
        _ => Ok(OllamaHealth {
            ok: false,
            models: vec![],
        }),
    }
}

#[tauri::command]
pub fn ai_chat(
    db: State<'_, Db>,
    messages: Vec<AiMessage>,
    token: Option<String>,
) -> Result<AiChatResult, String> {
    let conn = db.lock();
    require_session(&conn, &token)?;
    let settings = settings_from_conn(&conn);

    let today = chrono::Local::now().format("%Y-%m-%d").to_string();
    let month = chrono::Local::now().format("%Y-%m").to_string();

    let sales_today: i64 = conn
        .query_row(
            "SELECT COALESCE(SUM(total_cents),0) FROM sales WHERE substr(sold_at,1,10)=?1",
            rusqlite::params![today],
            |r| r.get(0),
        )
        .unwrap_or(0);
    let sales_month: i64 = conn
        .query_row(
            "SELECT COALESCE(SUM(total_cents),0) FROM sales WHERE substr(sold_at,1,7)=?1",
            rusqlite::params![month],
            |r| r.get(0),
        )
        .unwrap_or(0);
    let cash: i64 = conn
        .query_row(
            "SELECT COALESCE(SUM(CASE WHEN kind='expense' THEN -ABS(amount_cents) ELSE ABS(amount_cents) END),0) FROM cash_movements",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);
    let vat_month: i64 = conn
        .query_row(
            "SELECT COALESCE(SUM(vat_cents),0) FROM sales WHERE substr(sold_at,1,7)=?1",
            rusqlite::params![month],
            |r| r.get(0),
        )
        .unwrap_or(0);

    let products: Vec<Value> = {
        let mut stmt = conn
            .prepare(
                "SELECT name, stock, price_cents, vat_rate FROM products WHERE active=1 ORDER BY stock ASC LIMIT 20",
            )
            .map_err(|e| e.to_string())?;
        let rows: Vec<Value> = stmt
            .query_map([], |r| {
                Ok(json!({
                    "name": r.get::<_, String>(0)?,
                    "stock": r.get::<_, i64>(1)?,
                    "pvp": format!("{:.2}", r.get::<_, i64>(2)? as f64 / 100.0),
                    "iva": r.get::<_, i32>(3)?,
                }))
            })
            .map_err(|e| e.to_string())?
            .filter_map(|r| r.ok())
            .collect();
        rows
    };

    let low: Vec<String> = products
        .iter()
        .filter_map(|p| {
            let stock = p.get("stock")?.as_i64()?;
            let name = p.get("name")?.as_str()?;
            Some(format!("{name} ({stock})"))
        })
        .take(8)
        .collect();

    let context = json!({
        "tienda": settings.shop_name,
        "ventas_hoy_eur": format!("{:.2}", sales_today as f64 / 100.0),
        "ventas_mes_eur": format!("{:.2}", sales_month as f64 / 100.0),
        "caja_eur": format!("{:.2}", cash as f64 / 100.0),
        "iva_mes_eur": format!("{:.2}", vat_month as f64 / 100.0),
        "productos_muestra": products,
        "stock_muestra": low,
    });

    drop(conn);

    let system = format!(
        "Eres el asistente de la tienda \"{}\" en España. Responde en español, breve y práctico. \
Precios en EUR con IVA incluido. Contexto actual (JSON compacto): {}. \
No inventes datos fuera del contexto. Si falta info, dilo.",
        settings.shop_name,
        context
    );

    let mut payload_msgs = vec![json!({"role": "system", "content": system})];
    for m in messages {
        payload_msgs.push(json!({"role": m.role, "content": m.content}));
    }

    let url = format!("{}/api/chat", settings.ollama_url.trim_end_matches('/'));
    let client = reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(90))
        .build()
        .map_err(|e| e.to_string())?;

    match client
        .post(&url)
        .json(&json!({
            "model": settings.ollama_model,
            "stream": false,
            "messages": payload_msgs,
            "options": { "temperature": 0.4, "num_predict": 400 }
        }))
        .send()
    {
        Ok(res) if res.status().is_success() => {
            let data: Value = res.json().map_err(|e| e.to_string())?;
            let reply = data
                .pointer("/message/content")
                .and_then(|c| c.as_str())
                .unwrap_or("Sin respuesta del modelo.")
                .trim()
                .to_string();
            let model = data
                .get("model")
                .and_then(|m| m.as_str())
                .unwrap_or(&settings.ollama_model)
                .to_string();
            Ok(AiChatResult {
                reply,
                model,
                offline: Some(false),
            })
        }
        _ => Ok(AiChatResult {
            reply: "No puedo conectar con Ollama. Comprueba que `ollama serve` está activo y el modelo está instalado. La app sigue funcionando sin IA.".into(),
            model: settings.ollama_model,
            offline: Some(true),
        }),
    }
}

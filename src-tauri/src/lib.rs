mod commands;
mod db;
mod models;

use commands::{
    ai::{ai_chat, ollama_health},
    auth::{
        change_own_pin, complete_forced_password_change, list_users, login, logout, session_me,
        upsert_user,
    },
    cash::{create_cash_movement, get_cash_balance, list_cash_movements},
    customers::{list_customers, upsert_customer},
    products::{adjust_stock, list_products, upsert_product},
    reports::{dashboard_stats, vat_summary},
    sales::{create_sale, get_sale, list_sales},
    settings::{get_settings, public_meta, reset_demo, update_settings},
};
use db::open_db;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            use tauri::Manager;
            let path = app
                .path()
                .app_data_dir()
                .map_err(|e| e.to_string())?
                .join("nix-c.db");
            let db = open_db(path)?;
            app.manage(db);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            public_meta,
            login,
            logout,
            session_me,
            list_users,
            upsert_user,
            change_own_pin,
            complete_forced_password_change,
            list_products,
            upsert_product,
            adjust_stock,
            list_customers,
            upsert_customer,
            create_sale,
            list_sales,
            get_sale,
            list_cash_movements,
            create_cash_movement,
            get_cash_balance,
            vat_summary,
            dashboard_stats,
            get_settings,
            update_settings,
            ai_chat,
            ollama_health,
            reset_demo
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

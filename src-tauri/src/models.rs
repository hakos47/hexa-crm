use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Product {
    pub id: i64,
    pub sku: String,
    pub name: String,
    pub description: String,
    pub category: String,
    pub stock: i64,
    pub min_stock: i64,
    pub cost_cents: i64,
    pub price_cents: i64,
    pub vat_rate: i32,
    pub supplier_name: String,
    pub supplier_contact: String,
    pub supplier_email: String,
    pub supplier_phone: String,
    pub fulfillment_mode: String,
    pub stock_location: String,
    pub condition_code: String,
    pub active: bool,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProductInput {
    pub id: Option<i64>,
    pub sku: String,
    pub name: String,
    pub description: Option<String>,
    pub category: Option<String>,
    pub stock: Option<i64>,
    pub min_stock: Option<i64>,
    pub cost_cents: i64,
    pub price_cents: i64,
    pub vat_rate: i32,
    pub supplier_name: Option<String>,
    pub supplier_contact: Option<String>,
    pub supplier_email: Option<String>,
    pub supplier_phone: Option<String>,
    pub fulfillment_mode: Option<String>,
    pub stock_location: Option<String>,
    pub condition_code: Option<String>,
    pub active: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Customer {
    pub id: i64,
    pub name: String,
    pub email: String,
    pub phone: String,
    pub nif: String,
    pub notes: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CustomerInput {
    pub id: Option<i64>,
    pub name: String,
    pub email: Option<String>,
    pub phone: Option<String>,
    pub nif: Option<String>,
    pub notes: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SaleLineInput {
    pub product_id: i64,
    pub qty: i64,
    pub unit_price_cents: Option<i64>,
    pub discount_cents: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReturnLineInput {
    pub line_id: i64,
    pub qty: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SaleLine {
    pub id: i64,
    pub sale_id: i64,
    pub product_id: i64,
    pub product_name: Option<String>,
    pub qty: i64,
    pub unit_price_cents: i64,
    pub vat_rate: i32,
    pub line_base_cents: i64,
    pub line_vat_cents: i64,
    pub line_total_cents: i64,
    #[serde(default)]
    pub returned_qty: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Sale {
    pub id: i64,
    pub customer_id: Option<i64>,
    pub customer_name: Option<String>,
    pub number: String,
    pub sold_at: String,
    pub subtotal_cents: i64,
    pub vat_cents: i64,
    pub total_cents: i64,
    pub notes: String,
    pub status: String,
    #[serde(default)]
    pub refunded_cents: i64,
    pub lines: Option<Vec<SaleLine>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CashMovement {
    pub id: i64,
    pub kind: String,
    pub amount_cents: i64,
    pub category: String,
    pub description: String,
    pub sale_id: Option<i64>,
    pub occurred_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CashInput {
    pub kind: String,
    pub amount_cents: i64,
    pub category: String,
    pub description: Option<String>,
    pub occurred_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VatBucket {
    pub vat_rate: i32,
    pub base_cents: i64,
    pub vat_cents: i64,
    pub total_cents: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VatSummary {
    pub from: String,
    pub to: String,
    pub buckets: Vec<VatBucket>,
    pub base_cents: i64,
    pub vat_cents: i64,
    pub total_cents: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DashboardStats {
    pub sales_today_cents: i64,
    pub sales_month_cents: i64,
    pub sales_today_count: i64,
    pub sales_month_count: i64,
    pub cash_balance_cents: i64,
    pub low_stock: Vec<Product>,
    pub vat_month_cents: i64,
    pub base_month_cents: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Settings {
    pub shop_name: String,
    pub ollama_model: String,
    pub ollama_url: String,
    pub default_vat: i32,
    pub idle_timeout_minutes: i32,
    pub last_backup_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AiMessage {
    pub role: String,
    pub content: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AiChatResult {
    pub reply: String,
    pub model: String,
    pub offline: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OllamaHealth {
    pub ok: bool,
    pub models: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuthUser {
    pub id: i64,
    pub username: String,
    pub display_name: String,
    pub role: String,
    pub active: bool,
    pub created_at: String,
    pub must_change_password: bool,
    pub temp_password_issued_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserInput {
    pub id: Option<i64>,
    pub username: String,
    pub display_name: String,
    pub role: String,
    pub pin: Option<String>,
    pub active: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateUserResult {
    pub user: AuthUser,
    pub temporary_password: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LoginResult {
    pub user: AuthUser,
    pub token: String,
}

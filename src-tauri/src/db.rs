use parking_lot::Mutex;
use rusqlite::{params, Connection};
use std::path::PathBuf;
use std::sync::Arc;

pub type Db = Arc<Mutex<Connection>>;

pub fn open_db(path: PathBuf) -> Result<Db, String> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let conn = Connection::open(path).map_err(|e| e.to_string())?;
    conn.execute_batch("PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;")
        .map_err(|e| e.to_string())?;
    migrate(&conn)?;
    seed_if_empty(&conn)?;
    Ok(Arc::new(Mutex::new(conn)))
}

fn migrate(conn: &Connection) -> Result<(), String> {
    conn.execute_batch(
        r#"
        CREATE TABLE IF NOT EXISTS products (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            sku TEXT NOT NULL UNIQUE,
            name TEXT NOT NULL,
            description TEXT NOT NULL DEFAULT '',
            category TEXT NOT NULL DEFAULT '',
            stock INTEGER NOT NULL DEFAULT 0,
            min_stock INTEGER NOT NULL DEFAULT 0,
            cost_cents INTEGER NOT NULL DEFAULT 0,
            price_cents INTEGER NOT NULL DEFAULT 0,
            vat_rate INTEGER NOT NULL DEFAULT 21,
            active INTEGER NOT NULL DEFAULT 1,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS stock_movements (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            product_id INTEGER NOT NULL REFERENCES products(id),
            delta INTEGER NOT NULL,
            reason TEXT NOT NULL DEFAULT '',
            ref_type TEXT,
            ref_id INTEGER,
            created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS customers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            email TEXT NOT NULL DEFAULT '',
            phone TEXT NOT NULL DEFAULT '',
            nif TEXT NOT NULL DEFAULT '',
            notes TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS sales (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            customer_id INTEGER REFERENCES customers(id),
            number TEXT NOT NULL UNIQUE,
            sold_at TEXT NOT NULL,
            subtotal_cents INTEGER NOT NULL,
            vat_cents INTEGER NOT NULL,
            total_cents INTEGER NOT NULL,
            notes TEXT NOT NULL DEFAULT '',
            status TEXT NOT NULL DEFAULT 'completed',
            refunded_cents INTEGER NOT NULL DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS sale_lines (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            sale_id INTEGER NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
            product_id INTEGER NOT NULL REFERENCES products(id),
            qty INTEGER NOT NULL,
            unit_price_cents INTEGER NOT NULL,
            vat_rate INTEGER NOT NULL,
            line_base_cents INTEGER NOT NULL,
            line_vat_cents INTEGER NOT NULL,
            line_total_cents INTEGER NOT NULL,
            returned_qty INTEGER NOT NULL DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS cash_movements (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            kind TEXT NOT NULL,
            amount_cents INTEGER NOT NULL,
            category TEXT NOT NULL DEFAULT 'otros',
            description TEXT NOT NULL DEFAULT '',
            sale_id INTEGER REFERENCES sales(id),
            occurred_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL UNIQUE,
            display_name TEXT NOT NULL,
            role TEXT NOT NULL DEFAULT 'cajero',
            pin_hash TEXT NOT NULL,
            active INTEGER NOT NULL DEFAULT 1,
            created_at TEXT NOT NULL,
            must_change_password INTEGER NOT NULL DEFAULT 0,
            temp_password_issued_at TEXT
        );

        CREATE TABLE IF NOT EXISTS sessions (
            token TEXT PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            created_at TEXT NOT NULL
        );
        "#,
    )
    .map_err(|e| e.to_string())?;

    // Migrate older DBs missing temp-password columns
    let _ = conn.execute(
        "ALTER TABLE users ADD COLUMN must_change_password INTEGER NOT NULL DEFAULT 0",
        [],
    );
    let _ = conn.execute(
        "ALTER TABLE sales ADD COLUMN refunded_cents INTEGER NOT NULL DEFAULT 0",
        [],
    );
    let _ = conn.execute(
        "ALTER TABLE sale_lines ADD COLUMN returned_qty INTEGER NOT NULL DEFAULT 0",
        [],
    );
    let _ = conn.execute(
        "ALTER TABLE users ADD COLUMN temp_password_issued_at TEXT",
        [],
    );
    let _ = conn.execute(
        "ALTER TABLE products ADD COLUMN category TEXT NOT NULL DEFAULT ''",
        [],
    );

    seed_users_if_empty(conn)?;
    Ok(())
}

fn hash_pin(pin: &str) -> Result<String, String> {
    use rand::RngCore;
    use sha2::{Digest, Sha256};
    let mut salt = [0u8; 16];
    rand::thread_rng().fill_bytes(&mut salt);
    let salt_hex = hex::encode(salt);
    let mut hasher = Sha256::new();
    hasher.update(format!("{salt_hex}:{pin}").as_bytes());
    let digest = hex::encode(hasher.finalize());
    Ok(format!("v1${salt_hex}${digest}"))
}

pub fn verify_pin(pin: &str, stored: &str) -> bool {
    use sha2::{Digest, Sha256};
    let parts: Vec<&str> = stored.split('$').collect();
    if parts.len() != 3 || parts[0] != "v1" {
        return false;
    }
    let salt = parts[1];
    let expected = parts[2];
    let mut hasher = Sha256::new();
    hasher.update(format!("{salt}:{pin}").as_bytes());
    let digest = hex::encode(hasher.finalize());
    digest == expected
}

pub const TEMP_PASSWORD_LENGTH: usize = 14;
pub const TEMP_PASSWORD_TTL_SECS: i64 = 24 * 60 * 60;

pub fn generate_temp_password() -> String {
    use rand::Rng;
    const CHARSET: &[u8] = b"ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
    let mut rng = rand::thread_rng();
    (0..TEMP_PASSWORD_LENGTH)
        .map(|_| {
            let idx = rng.gen_range(0..CHARSET.len());
            CHARSET[idx] as char
        })
        .collect()
}

pub fn is_temp_expired(issued_at: &Option<String>) -> bool {
    let Some(iso) = issued_at else {
        return true;
    };
    match chrono::DateTime::parse_from_rfc3339(iso) {
        Ok(dt) => {
            let age = chrono::Utc::now().signed_duration_since(dt.with_timezone(&chrono::Utc));
            age.num_seconds() > TEMP_PASSWORD_TTL_SECS
        }
        Err(_) => true,
    }
}

fn seed_users_if_empty(conn: &Connection) -> Result<(), String> {
    let count: i64 = conn
        .query_row("SELECT COUNT(*) FROM users", [], |r| r.get(0))
        .map_err(|e| e.to_string())?;
    if count > 0 {
        return Ok(());
    }
    let now = chrono::Utc::now().to_rfc3339();
    let admin_hash = hash_pin("1234")?;
    let cajero_hash = hash_pin("0000")?;
    conn.execute(
        "INSERT INTO users (username, display_name, role, pin_hash, active, created_at, must_change_password, temp_password_issued_at)
         VALUES ('admin', 'Administrador', 'admin', ?1, 1, ?2, 0, NULL)",
        params![admin_hash, now],
    )
    .map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO users (username, display_name, role, pin_hash, active, created_at, must_change_password, temp_password_issued_at)
         VALUES ('cajero', 'Cajero', 'cajero', ?1, 1, ?2, 0, NULL)",
        params![cajero_hash, now],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

fn seed_if_empty(conn: &Connection) -> Result<(), String> {
    let count: i64 = conn
        .query_row("SELECT COUNT(*) FROM products", [], |r| r.get(0))
        .map_err(|e| e.to_string())?;
    if count > 0 {
        return Ok(());
    }

    let now = chrono::Utc::now().to_rfc3339();
    let defaults = [
        ("shop_name", "Mi Tienda"),
        ("ollama_model", "qwen3.5:4b"),
        ("ollama_url", "http://127.0.0.1:11434"),
        ("default_vat", "21"),
    ];
    for (k, v) in defaults {
        conn.execute(
            "INSERT OR IGNORE INTO settings (key, value) VALUES (?1, ?2)",
            params![k, v],
        )
        .map_err(|e| e.to_string())?;
    }

    let products = [
        (
            "CAF-001",
            "Café de especialidad 250g",
            "Tueste medio, origen Colombia",
            "Alimentación",
            40,
            10,
            450,
            990,
            10,
        ),
        (
            "LIB-021",
            "Libro de cocina mediterránea",
            "Edición tapa blanda",
            "Libros",
            12,
            5,
            900,
            1890,
            4,
        ),
        (
            "TEC-110",
            "Auriculares Bluetooth",
            "Cancelación de ruido",
            "Tecnología",
            8,
            4,
            2500,
            4990,
            21,
        ),
        (
            "ALI-050",
            "Miel artesanal 500g",
            "Producción local",
            "Alimentación",
            3,
            6,
            350,
            750,
            10,
        ),
    ];

    for p in products {
        conn.execute(
            "INSERT INTO products (sku, name, description, category, stock, min_stock, cost_cents, price_cents, vat_rate, active, created_at, updated_at)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,1,?10,?10)",
            params![p.0, p.1, p.2, p.3, p.4, p.5, p.6, p.7, p.8, now],
        )
        .map_err(|e| e.to_string())?;
    }

    conn.execute(
        "INSERT INTO customers (name, email, phone, nif, notes, created_at)
         VALUES ('Cliente contado', '', '', '', 'Cliente genérico', ?1)",
        params![now],
    )
    .map_err(|e| e.to_string())?;

    Ok(())
}

pub fn now_iso() -> String {
    chrono::Utc::now().to_rfc3339()
}

pub fn valid_vat(rate: i32) -> bool {
    matches!(rate, 0 | 4 | 10 | 21)
}

/// Split tax-inclusive total into base + VAT (cents).
pub fn split_inclusive(total_cents: i64, rate: i32) -> (i64, i64) {
    if rate == 0 {
        return (total_cents, 0);
    }
    let base = ((total_cents as f64) / (1.0 + (rate as f64) / 100.0)).round() as i64;
    (base, total_cents - base)
}

pub fn hash_pin_public(pin: &str) -> Result<String, String> {
    hash_pin(pin)
}

pub fn validate_pin(pin: &str) -> Result<(), String> {
    let p = pin.trim();
    if p.len() < 4 || p.len() > 8 || !p.chars().all(|c| c.is_ascii_digit()) {
        return Err("El PIN debe tener entre 4 y 8 dígitos".into());
    }
    Ok(())
}

pub fn validate_permanent_password(password: &str) -> Result<(), String> {
    let p = password.trim();
    if p.len() < 8 {
        return Err("La contraseña debe tener al menos 8 caracteres".into());
    }
    if p.len() > 128 {
        return Err("La contraseña es demasiado larga".into());
    }
    Ok(())
}

pub fn validate_credential(secret: &str) -> Result<(), String> {
    if validate_pin(secret).is_ok() || validate_permanent_password(secret).is_ok() {
        return Ok(());
    }
    validate_permanent_password(secret)
}

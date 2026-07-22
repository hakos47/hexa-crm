import postgres from "postgres";
import { hashPin, verifyCredential } from "../auth/pin";
import {
  clearTempCredentialFields,
  generateTempPassword,
  issueTempCredentialFields,
  shouldRejectExpiredTemp,
  validatePermanentPassword,
} from "../auth/password-policy";
import { validatePin } from "../auth/pin";
import { extractOllamaReply, ollamaChatBody } from "../ai/ollama-reply";
import { isVatRate, lineBreakdown, type VatRate } from "../vat";
import {
  createBackupEnvelope,
  createPreMigrationBackup,
  validateBackup,
  type BackupEnvelope,
} from "../backup/backup";
import type {
  AiChatResult,
  AiMessage,
  AuthUser,
  CashInput,
  CashMovement,
  Company,
  CreateUserResult,
  Customer,
  CustomerInput,
  DashboardStats,
  LoginResult,
  Product,
  ProductInput,
  ReturnLineInput,
  Sale,
  SaleLineInput,
  Settings,
  UserInput,
  VatSummary,
} from "../types";
import {
  billingByCompany,
  canAccessCompany,
  companiesForUser,
  pickDefaultCompanyId,
  seedCompanies,
  seedCompanyMembers,
} from "../company/context";
import { planPartialReturn, remainingLineAmounts } from "../sales/partial-return";

// Prefer Vite/SvelteKit private env; fall back to process.env and local Docker defaults.
function resolveDatabaseUrl(): string {
  const fromProcess =
    (typeof process !== "undefined" && process.env?.DATABASE_URL) || "";
  if (fromProcess) return fromProcess;
  // Default: Docker container `nix-c-postgres` (pgvector on host 5432)
  return "postgresql://hakos:nix_password@127.0.0.1:5432/nix_crm";
}

const DATABASE_URL = resolveDatabaseUrl();

let sql: postgres.Sql;

if (globalThis as any) {
  if (!(globalThis as any)._postgres_sql) {
    (globalThis as any)._postgres_sql = postgres(DATABASE_URL, {
      max: 10,
      idle_timeout: 20,
      connect_timeout: 10,
    });
  }
  sql = (globalThis as any)._postgres_sql;
} else {
  sql = postgres(DATABASE_URL);
}

export { sql };

function toIso(d: Date | string | null | undefined): string {
  if (!d) return "";
  if (typeof d === "string") return d;
  return d.toISOString();
}

// -------------------------------------------------------------
// DDL & Migrations
// -------------------------------------------------------------
export async function initDb() {
  // Asegurar extensión pgvector
  await sql`CREATE EXTENSION IF NOT EXISTS vector`;

  await sql`
    CREATE TABLE IF NOT EXISTS companies (
      id SERIAL PRIMARY KEY,
      code TEXT NOT NULL UNIQUE,
      legal_name TEXT NOT NULL,
      trade_name TEXT NOT NULL,
      nif TEXT NOT NULL DEFAULT '',
      kind TEXT NOT NULL DEFAULT 'generic',
      active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
    );
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS company_members (
      company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL,
      role TEXT NOT NULL DEFAULT 'cajero',
      PRIMARY KEY (company_id, user_id)
    );
  `;

  // Crear tablas
  await sql`
    CREATE TABLE IF NOT EXISTS products (
      id SERIAL PRIMARY KEY,
      sku TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      category TEXT NOT NULL DEFAULT '',
      stock INTEGER NOT NULL DEFAULT 0,
      min_stock INTEGER NOT NULL DEFAULT 0,
      cost_cents INTEGER NOT NULL DEFAULT 0,
      price_cents INTEGER NOT NULL DEFAULT 0,
      vat_rate INTEGER NOT NULL DEFAULT 21,
      active BOOLEAN NOT NULL DEFAULT TRUE,
      embedding vector(384),
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
    );
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS stock_movements (
      id SERIAL PRIMARY KEY,
      product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      delta INTEGER NOT NULL,
      reason TEXT NOT NULL DEFAULT '',
      ref_type TEXT,
      ref_id INTEGER,
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
    );
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS customers (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL DEFAULT '',
      phone TEXT NOT NULL DEFAULT '',
      nif TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
    );
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS sales (
      id SERIAL PRIMARY KEY,
      customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
      number TEXT NOT NULL UNIQUE,
      sold_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
      subtotal_cents INTEGER NOT NULL,
      vat_cents INTEGER NOT NULL,
      total_cents INTEGER NOT NULL,
      notes TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'completed'
    );
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS sale_lines (
      id SERIAL PRIMARY KEY,
      sale_id INTEGER NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
      product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      qty INTEGER NOT NULL,
      unit_price_cents INTEGER NOT NULL,
      vat_rate INTEGER NOT NULL,
      line_base_cents INTEGER NOT NULL,
      line_vat_cents INTEGER NOT NULL,
      line_total_cents INTEGER NOT NULL
    );
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS cash_movements (
      id SERIAL PRIMARY KEY,
      kind TEXT NOT NULL,
      amount_cents INTEGER NOT NULL,
      category TEXT NOT NULL DEFAULT 'otros',
      description TEXT NOT NULL DEFAULT '',
      sale_id INTEGER REFERENCES sales(id) ON DELETE SET NULL,
      occurred_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
    );
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      display_name TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'cajero',
      pin_hash TEXT NOT NULL,
      active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
      must_change_password BOOLEAN NOT NULL DEFAULT FALSE,
      temp_password_issued_at TIMESTAMP WITH TIME ZONE
    );
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
    );
  `;

  // Multi-empresa columns (idempotent)
  await sql`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS active_company_id INTEGER`;
  await sql`ALTER TABLE products ADD COLUMN IF NOT EXISTS company_id INTEGER NOT NULL DEFAULT 1`;
  await sql`ALTER TABLE customers ADD COLUMN IF NOT EXISTS company_id INTEGER NOT NULL DEFAULT 1`;
  await sql`ALTER TABLE sales ADD COLUMN IF NOT EXISTS company_id INTEGER NOT NULL DEFAULT 1`;
  await sql`ALTER TABLE cash_movements ADD COLUMN IF NOT EXISTS company_id INTEGER NOT NULL DEFAULT 1`;
  // Partial returns (ciclo 8)
  await sql`ALTER TABLE sales ADD COLUMN IF NOT EXISTS refunded_cents INTEGER NOT NULL DEFAULT 0`;
  await sql`ALTER TABLE sale_lines ADD COLUMN IF NOT EXISTS returned_qty INTEGER NOT NULL DEFAULT 0`;

  // Seeders
  await seedSettings();
  await seedUsers();
  await seedCompaniesPg();
  await seedProductsAndCustomers();
}

async function seedCompaniesPg() {
  const count = await sql`SELECT COUNT(*)::int as count FROM companies`;
  if (count[0].count > 0) {
    await ensureDefaultMembers();
    return;
  }
  const t = new Date().toISOString();
  for (const c of seedCompanies(t)) {
    await sql`
      INSERT INTO companies (id, code, legal_name, trade_name, nif, kind, active, created_at)
      VALUES (${c.id}, ${c.code}, ${c.legal_name}, ${c.trade_name}, ${c.nif}, ${c.kind}, ${c.active}, ${c.created_at})
      ON CONFLICT (id) DO NOTHING
    `;
  }
  // Keep serial in sync
  await sql`SELECT setval(pg_get_serial_sequence('companies','id'), (SELECT COALESCE(MAX(id),1) FROM companies))`;
  await ensureDefaultMembers();
}

async function ensureDefaultMembers() {
  const users = await sql`SELECT id, username FROM users ORDER BY id ASC`;
  if (users.length === 0) return;
  const admin = users.find((u) => u.username === "admin") ?? users[0];
  const cajero = users.find((u) => u.username === "cajero") ?? admin;
  const members = seedCompanyMembers({ adminId: admin.id, cajeroId: cajero.id });
  for (const m of members) {
    await sql`
      INSERT INTO company_members (company_id, user_id, role)
      VALUES (${m.company_id}, ${m.user_id}, ${m.role})
      ON CONFLICT (company_id, user_id) DO NOTHING
    `;
  }
}

async function loadCompanies(): Promise<Company[]> {
  const rows = await sql`SELECT * FROM companies WHERE active = TRUE ORDER BY id`;
  return rows.map((r) => ({
    id: r.id,
    code: r.code,
    legal_name: r.legal_name,
    trade_name: r.trade_name,
    nif: r.nif,
    kind: r.kind,
    active: !!r.active,
    created_at: toIso(r.created_at),
  }));
}

async function loadMembers(): Promise<{ company_id: number; user_id: number; role: string }[]> {
  return await sql`SELECT company_id, user_id, role FROM company_members`;
}

async function resolveActiveCompanyId(token: string, userId: number): Promise<number> {
  const companies = await loadCompanies();
  const members = await loadMembers();
  const accessible = companiesForUser(
    userId,
    members as { company_id: number; user_id: number; role: "admin" | "cajero" }[],
    companies,
  );
  const sess = await sql`SELECT active_company_id FROM sessions WHERE token = ${token}`;
  const preferred = sess[0]?.active_company_id as number | null | undefined;
  const id = pickDefaultCompanyId(accessible, preferred);
  if (id == null) throw new Error("Sin empresa asignada al usuario");
  if (preferred !== id) {
    await sql`UPDATE sessions SET active_company_id = ${id} WHERE token = ${token}`;
  }
  return id;
}

async function seedSettings() {
  const defaults = [
    { key: "shop_name", value: "Mi Tienda" },
    { key: "ollama_model", value: "qwen3.5:4b" },
    { key: "ollama_url", value: "http://127.0.0.1:11434" },
    { key: "default_vat", value: "21" },
  ];
  for (const { key, value } of defaults) {
    await sql`
      INSERT INTO settings (key, value)
      VALUES (${key}, ${value})
      ON CONFLICT (key) DO NOTHING
    `;
  }
}

async function seedUsers() {
  const countRes = await sql`SELECT COUNT(*)::int as count FROM users`;
  if (countRes[0].count > 0) return;

  const adminHash = await hashPin("1234");
  const cajeroHash = await hashPin("0000");

  await sql`
    INSERT INTO users (username, display_name, role, pin_hash, active, must_change_password)
    VALUES 
      ('admin', 'Administrador', 'admin', ${adminHash}, TRUE, FALSE),
      ('cajero', 'Cajero', 'cajero', ${cajeroHash}, TRUE, FALSE)
  `;
}

async function seedProductsAndCustomers() {
  const countProducts = await sql`SELECT COUNT(*)::int as count FROM products`;
  if (countProducts[0].count > 0) return;

  const products = [
    { sku: "CAF-001", name: "Café de especialidad 250g", desc: "Tueste medio, origen Colombia", cat: "Alimentación", stock: 40, min: 10, cost: 450, price: 990, vat: 10 },
    { sku: "LIB-021", name: "Libro de cocina mediterránea", desc: "Edición tapa blanda", cat: "Libros", stock: 12, min: 5, cost: 900, price: 1890, vat: 4 },
    { sku: "TEC-110", name: "Auriculares Bluetooth", desc: "Cancelación de ruido", cat: "Tecnología", stock: 8, min: 4, cost: 2500, price: 4990, vat: 21 },
    { sku: "ALI-050", name: "Miel artesanal 500g", desc: "Producción local", cat: "Alimentación", stock: 3, min: 6, cost: 350, price: 750, vat: 10 },
  ];

  for (const p of products) {
    await sql`
      INSERT INTO products (sku, name, description, category, stock, min_stock, cost_cents, price_cents, vat_rate, active)
      VALUES (${p.sku}, ${p.name}, ${p.desc}, ${p.cat}, ${p.stock}, ${p.min}, ${p.cost}, ${p.price}, ${p.vat}, TRUE)
    `;
  }

  await sql`
    INSERT INTO customers (name, email, phone, nif, notes)
    VALUES ('Cliente contado', '', '', '', 'Cliente genérico')
  `;
}

// -------------------------------------------------------------
// Security / Session Guards
// -------------------------------------------------------------
async function requireSession(token: string | null): Promise<AuthUser> {
  if (!token) throw new Error("Sesión no iniciada");
  const sessRes = await sql`
    SELECT s.token, u.id, u.username, u.display_name, u.role, u.active, u.created_at, u.must_change_password, u.temp_password_issued_at
    FROM sessions s
    JOIN users u ON s.user_id = u.id
    WHERE s.token = ${token} AND u.active = TRUE
  `;
  if (sessRes.length === 0) throw new Error("Sesión inválida o expirada");
  const u = sessRes[0];
  return {
    id: u.id,
    username: u.username,
    display_name: u.display_name,
    role: u.role,
    active: u.active,
    created_at: toIso(u.created_at),
    must_change_password: !!u.must_change_password,
    temp_password_issued_at: toIso(u.temp_password_issued_at) || null,
  };
}

async function requireAdmin(token: string | null): Promise<AuthUser> {
  const u = await requireSession(token);
  if (u.role !== "admin") throw new Error("Se requieren permisos de administrador");
  return u;
}

// -------------------------------------------------------------
// Core Business Operations
// -------------------------------------------------------------
export const postgresApi = {
  async public_meta(): Promise<{ shop_name: string }> {
    const res = await sql`SELECT value FROM settings WHERE key = 'shop_name'`;
    return { shop_name: res[0]?.value || "hexa-crm" };
  },

  async login(username: string, password: string): Promise<LoginResult> {
    const userRes = await sql`
      SELECT id, username, display_name, role, active, pin_hash, must_change_password, temp_password_issued_at, created_at
      FROM users
      WHERE LOWER(username) = ${username.trim().toLowerCase()} AND active = TRUE
    `;
    if (userRes.length === 0) throw new Error("Usuario o contraseña incorrectos");
    const user = userRes[0];

    const ok = await verifyCredential(password, user.pin_hash);
    if (!ok) throw new Error("Usuario o contraseña incorrectos");

    if (
      shouldRejectExpiredTemp({
        must_change_password: !!user.must_change_password,
        temp_password_issued_at: user.temp_password_issued_at ? user.temp_password_issued_at.toISOString() : null,
      })
    ) {
      throw new Error(
        "La contraseña temporal ha caducado (más de 24 h). Contacta al administrador para que genere una nueva."
      );
    }

    // Generar sesión
    const token = Array.from(crypto.getRandomValues(new Uint8Array(24)))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    const companies = await loadCompanies();
    const members = await loadMembers();
    const accessible = companiesForUser(
      user.id,
      members as { company_id: number; user_id: number; role: "admin" | "cajero" }[],
      companies,
    );
    const active_company_id = pickDefaultCompanyId(accessible);

    await sql`
      INSERT INTO sessions (token, user_id, active_company_id)
      VALUES (${token}, ${user.id}, ${active_company_id})
    `;

    // Limitar a las últimas 20 sesiones para evitar inflar la tabla
    const totalSess = await sql`SELECT token FROM sessions ORDER BY created_at DESC OFFSET 20`;
    if (totalSess.length > 0) {
      const tokensToDelete = totalSess.map((t) => t.token);
      await sql`DELETE FROM sessions WHERE token IN ${sql(tokensToDelete)}`;
    }

    return {
      user: {
        id: user.id,
        username: user.username,
        display_name: user.display_name,
        role: user.role,
        active: user.active,
        created_at: toIso(user.created_at),
        must_change_password: !!user.must_change_password,
        temp_password_issued_at: toIso(user.temp_password_issued_at) || null,
      },
      token,
      companies: accessible,
      active_company_id,
    };
  },

  async logout(token: string | null): Promise<void> {
    if (!token) return;
    await sql`DELETE FROM sessions WHERE token = ${token}`;
  },

  async session_me(token: string | null): Promise<AuthUser | null> {
    if (!token) return null;
    try {
      return await requireSession(token);
    } catch {
      return null;
    }
  },

  async list_companies(token: string | null): Promise<Company[]> {
    const user = await requireSession(token);
    const companies = await loadCompanies();
    const members = await loadMembers();
    return companiesForUser(
      user.id,
      members as { company_id: number; user_id: number; role: "admin" | "cajero" }[],
      companies,
    );
  },

  async get_active_company(token: string | null): Promise<Company | null> {
    const user = await requireSession(token);
    if (!token) return null;
    const cid = await resolveActiveCompanyId(token, user.id);
    const companies = await loadCompanies();
    return companies.find((c) => c.id === cid) ?? null;
  },

  async set_active_company(company_id: number, token: string | null): Promise<Company> {
    const user = await requireSession(token);
    if (!token) throw new Error("Sesión no iniciada");
    const members = await loadMembers();
    if (
      !canAccessCompany(
        user.id,
        company_id,
        members as { company_id: number; user_id: number; role: "admin" | "cajero" }[],
      )
    ) {
      throw new Error("No tienes acceso a esa empresa");
    }
    await sql`UPDATE sessions SET active_company_id = ${company_id} WHERE token = ${token}`;
    const companies = await loadCompanies();
    const c = companies.find((x) => x.id === company_id);
    if (!c) throw new Error("Empresa no encontrada");
    return c;
  },

  async billing_by_company(token: string | null) {
    await requireSession(token);
    const companies = await loadCompanies();
    const sales = await sql`
      SELECT company_id, total_cents, status FROM sales
    `;
    return billingByCompany(
      sales.map((s) => ({
        company_id: s.company_id,
        total_cents: s.total_cents,
        status: s.status,
      })),
      companies,
    );
  },

  async list_users(token: string | null): Promise<AuthUser[]> {
    await requireAdmin(token);
    const users = await sql`
      SELECT id, username, display_name, role, active, created_at, must_change_password, temp_password_issued_at
      FROM users
      ORDER BY id ASC
    `;
    return users.map((u) => ({
      id: u.id,
      username: u.username,
      display_name: u.display_name,
      role: u.role,
      active: u.active,
      created_at: toIso(u.created_at),
      must_change_password: !!u.must_change_password,
      temp_password_issued_at: toIso(u.temp_password_issued_at) || null,
    }));
  },

  async upsert_user(input: UserInput, token: string | null): Promise<CreateUserResult> {
    await requireAdmin(token);
    const now = new Date();
    const role = input.role === "cajero" ? "cajero" : "admin";
    const username = input.username.trim().toLowerCase();
    if (!username) throw new Error("Usuario obligatorio");

    if (input.id) {
      const updateData: Record<string, unknown> = {
        username,
        display_name: input.display_name.trim() || username,
        role,
        active: input.active ?? true,
      };

      let temporary_password: string | undefined;
      if (input.pin === "__regen_temp__") {
        temporary_password = generateTempPassword();
        const fields = issueTempCredentialFields();
        updateData.pin_hash = await hashPin(temporary_password);
        updateData.must_change_password = fields.must_change_password;
        updateData.temp_password_issued_at = fields.temp_password_issued_at
          ? new Date(fields.temp_password_issued_at)
          : now;
      } else if (input.pin) {
        const pinOk = !validatePin(input.pin);
        const pwOk = !validatePermanentPassword(input.pin);
        if (!pinOk && !pwOk) {
          throw new Error(validatePermanentPassword(input.pin) || "Credencial no válida");
        }
        updateData.pin_hash = await hashPin(input.pin);
        const cleared = clearTempCredentialFields();
        updateData.must_change_password = cleared.must_change_password;
        updateData.temp_password_issued_at = null;
      }

      const res = await sql`
        UPDATE users
        SET ${sql(updateData)}
        WHERE id = ${input.id}
        RETURNING id, username, display_name, role, active, created_at, must_change_password, temp_password_issued_at
      `;
      if (res.length === 0) throw new Error("Usuario no encontrado");
      const u = res[0];
      return {
        user: {
          id: u.id,
          username: u.username,
          display_name: u.display_name,
          role: u.role,
          active: u.active,
          created_at: toIso(u.created_at),
          must_change_password: !!u.must_change_password,
          temp_password_issued_at: toIso(u.temp_password_issued_at) || null,
        },
        temporary_password,
      };
    }

    const temporary_password = generateTempPassword();
    const fields = issueTempCredentialFields();
    const hash = await hashPin(temporary_password);

    const res = await sql`
      INSERT INTO users (username, display_name, role, pin_hash, active, must_change_password, temp_password_issued_at)
      VALUES (
        ${username},
        ${input.display_name.trim() || username},
        ${role},
        ${hash},
        ${input.active ?? true},
        ${fields.must_change_password},
        ${fields.temp_password_issued_at ? new Date(fields.temp_password_issued_at) : now}
      )
      RETURNING id, username, display_name, role, active, created_at, must_change_password, temp_password_issued_at
    `;
    const u = res[0];
    return {
      user: {
        id: u.id,
        username: u.username,
        display_name: u.display_name,
        role: u.role,
        active: u.active,
        created_at: toIso(u.created_at),
        must_change_password: !!u.must_change_password,
        temp_password_issued_at: toIso(u.temp_password_issued_at) || null,
      },
      temporary_password,
    };
  },

  async change_own_pin(current_pin: string, new_pin: string, token: string | null): Promise<void> {
    const me = await requireSession(token);
    const userRes = await sql`SELECT pin_hash FROM users WHERE id = ${me.id}`;
    const user = userRes[0];
    const ok = await verifyCredential(current_pin, user.pin_hash);
    if (!ok) throw new Error("PIN actual incorrecto");

    const newHash = await hashPin(new_pin);
    await sql`
      UPDATE users
      SET pin_hash = ${newHash}, must_change_password = FALSE, temp_password_issued_at = NULL
      WHERE id = ${me.id}
    `;
  },

  async complete_forced_password_change(current_password: string, new_password: string, token: string | null): Promise<AuthUser> {
    const me = await requireSession(token);
    const userRes = await sql`SELECT pin_hash FROM users WHERE id = ${me.id}`;
    const user = userRes[0];
    const ok = await verifyCredential(current_password, user.pin_hash);
    if (!ok) throw new Error("Contraseña actual incorrecta");

    const newHash = await hashPin(new_password);
    const res = await sql`
      UPDATE users
      SET pin_hash = ${newHash}, must_change_password = FALSE, temp_password_issued_at = NULL
      WHERE id = ${me.id}
      RETURNING id, username, display_name, role, active, created_at, must_change_password, temp_password_issued_at
    `;
    const u = res[0];
    return {
      id: u.id,
      username: u.username,
      display_name: u.display_name,
      role: u.role,
      active: u.active,
      created_at: toIso(u.created_at),
      must_change_password: !!u.must_change_password,
      temp_password_issued_at: toIso(u.temp_password_issued_at) || null,
    };
  },

  async list_products(active_only: boolean, token: string | null): Promise<Product[]> {
    const user = await requireSession(token);
    if (!token) throw new Error("Sesión no iniciada");
    const cid = await resolveActiveCompanyId(token, user.id);
    const products = active_only
      ? await sql`SELECT * FROM products WHERE active = TRUE AND company_id = ${cid} ORDER BY name ASC`
      : await sql`SELECT * FROM products WHERE company_id = ${cid} ORDER BY name ASC`;

    return products.map((p) => ({
      id: p.id,
      company_id: p.company_id,
      sku: p.sku,
      name: p.name,
      description: p.description,
      category: p.category,
      stock: p.stock,
      min_stock: p.min_stock,
      cost_cents: p.cost_cents,
      price_cents: p.price_cents,
      vat_rate: p.vat_rate,
      active: !!p.active,
      created_at: toIso(p.created_at),
      updated_at: toIso(p.updated_at),
    }));
  },

  async upsert_product(input: ProductInput, token: string | null): Promise<Product> {
    await requireSession(token);
    const now = new Date();

    if (input.id) {
      // Update
      const res = await sql`
        UPDATE products
        SET 
          sku = ${input.sku},
          name = ${input.name},
          description = ${input.description ?? ""},
          category = ${input.category ?? ""},
          min_stock = ${input.min_stock ?? 0},
          cost_cents = ${input.cost_cents},
          price_cents = ${input.price_cents},
          vat_rate = ${input.vat_rate},
          active = ${input.active ?? true},
          updated_at = ${now}
        WHERE id = ${input.id}
        RETURNING *
      `;
      if (res.length === 0) throw new Error("Producto no encontrado");
      const p = res[0];
      return {
        id: p.id,
        sku: p.sku,
        name: p.name,
        description: p.description,
        category: p.category,
        stock: p.stock,
        min_stock: p.min_stock,
        cost_cents: p.cost_cents,
        price_cents: p.price_cents,
        vat_rate: p.vat_rate,
        active: !!p.active,
        created_at: toIso(p.created_at),
        updated_at: toIso(p.updated_at),
      };
    } else {
      // Create
      const res = await sql`
        INSERT INTO products (sku, name, description, category, stock, min_stock, cost_cents, price_cents, vat_rate, active)
        VALUES (
          ${input.sku},
          ${input.name},
          ${input.description ?? ""},
          ${input.category ?? ""},
          ${input.stock ?? 0},
          ${input.min_stock ?? 0},
          ${input.cost_cents},
          ${input.price_cents},
          ${input.vat_rate},
          ${input.active ?? true}
        )
        RETURNING *
      `;
      const p = res[0];

      // Registrar movimiento de stock inicial si es mayor que 0
      if (p.stock > 0) {
        await sql`
          INSERT INTO stock_movements (product_id, delta, reason)
          VALUES (${p.id}, ${p.stock}, 'Stock inicial')
        `;
      }

      return {
        id: p.id,
        sku: p.sku,
        name: p.name,
        description: p.description,
        category: p.category,
        stock: p.stock,
        min_stock: p.min_stock,
        cost_cents: p.cost_cents,
        price_cents: p.price_cents,
        vat_rate: p.vat_rate,
        active: !!p.active,
        created_at: toIso(p.created_at),
        updated_at: toIso(p.updated_at),
      };
    }
  },

  async adjust_stock(product_id: number, delta: number, reason: string, token: string | null): Promise<Product> {
    await requireSession(token);
    const now = new Date();

    const updated = await sql.begin(async (tx) => {
      // Leer actual
      const prodRes = await tx`SELECT stock FROM products WHERE id = ${product_id}`;
      if (prodRes.length === 0) throw new Error("Producto no encontrado");
      const currentStock = prodRes[0].stock;
      const newStock = currentStock + delta;
      if (newStock < 0) throw new Error("El stock resultante no puede ser negativo");

      // Actualizar
      const res = await tx`
        UPDATE products
        SET stock = ${newStock}, updated_at = ${now}
        WHERE id = ${product_id}
        RETURNING *
      `;

      // Registrar movimiento
      await tx`
        INSERT INTO stock_movements (product_id, delta, reason)
        VALUES (${product_id}, ${delta}, ${reason})
      `;

      return res[0];
    });

    return {
      id: updated.id,
      sku: updated.sku,
      name: updated.name,
      description: updated.description,
      category: updated.category,
      stock: updated.stock,
      min_stock: updated.min_stock,
      cost_cents: updated.cost_cents,
      price_cents: updated.price_cents,
      vat_rate: updated.vat_rate,
      active: !!updated.active,
      created_at: toIso(updated.created_at),
      updated_at: toIso(updated.updated_at),
    };
  },

  async list_customers(token: string | null): Promise<Customer[]> {
    await requireSession(token);
    const customers = await sql`SELECT * FROM customers ORDER BY name ASC`;
    return customers.map((c) => ({
      id: c.id,
      name: c.name,
      email: c.email,
      phone: c.phone,
      nif: c.nif,
      notes: c.notes,
      created_at: toIso(c.created_at),
    }));
  },

  async upsert_customer(input: CustomerInput, token: string | null): Promise<Customer> {
    await requireSession(token);
    if (input.id) {
      const res = await sql`
        UPDATE customers
        SET 
          name = ${input.name},
          email = ${input.email ?? ""},
          phone = ${input.phone ?? ""},
          nif = ${input.nif ?? ""},
          notes = ${input.notes ?? ""}
        WHERE id = ${input.id}
        RETURNING *
      `;
      if (res.length === 0) throw new Error("Cliente no encontrado");
      const c = res[0];
      return {
        id: c.id,
        name: c.name,
        email: c.email,
        phone: c.phone,
        nif: c.nif,
        notes: c.notes,
        created_at: toIso(c.created_at),
      };
    } else {
      const res = await sql`
        INSERT INTO customers (name, email, phone, nif, notes)
        VALUES (${input.name}, ${input.email ?? ""}, ${input.phone ?? ""}, ${input.nif ?? ""}, ${input.notes ?? ""})
        RETURNING *
      `;
      const c = res[0];
      return {
        id: c.id,
        name: c.name,
        email: c.email,
        phone: c.phone,
        nif: c.nif,
        notes: c.notes,
        created_at: toIso(c.created_at),
      };
    }
  },

  async create_sale(lines: SaleLineInput[], customer_id: number | null | undefined, notes: string | undefined, token: string | null): Promise<Sale> {
    const user = await requireSession(token);
    if (!token) throw new Error("Sesión no iniciada");
    const cid = await resolveActiveCompanyId(token, user.id);
    if (lines.length === 0) throw new Error("La venta debe contener al menos una línea");

    const sale = await sql.begin(async (tx) => {
      // 1. Calcular totales
      let subtotal = 0;
      let totalVat = 0;
      let total = 0;

      // Obtener todos los productos implicados para verificar stock e IVA
      const productIds = lines.map((l) => l.product_id);
      const prods = await tx`SELECT id, name, price_cents, vat_rate, stock, company_id FROM products WHERE id IN ${tx(productIds)} AND company_id = ${cid}`;
      const prodMap = new Map(prods.map((p) => [p.id, p]));

      const calculatedLines = [];

      for (const line of lines) {
        const prod = prodMap.get(line.product_id);
        if (!prod) throw new Error(`Producto ${line.product_id} no encontrado`);
        if (line.qty <= 0) throw new Error(`Cantidad inválida para ${prod.name}`);
        if (prod.stock < line.qty) {
          throw new Error(`Stock insuficiente para ${prod.name}. Disponible: ${prod.stock}, Solicitado: ${line.qty}`);
        }

        // Unit price: optional override; discount_cents is tax-inclusive (same as TPV / browser-store).
        const unit = line.unit_price_cents ?? prod.price_cents;
        const maxDisc = unit * line.qty;
        const discount = Math.min(Math.max(0, line.discount_cents ?? 0), maxDisc);
        const rate: VatRate = isVatRate(Number(prod.vat_rate))
          ? (Number(prod.vat_rate) as VatRate)
          : 21;
        const br = lineBreakdown({
          qty: line.qty,
          unitPriceCents: unit,
          vatRate: rate,
          discountCents: discount,
        });

        subtotal += br.lineBaseCents;
        totalVat += br.lineVatCents;
        total += br.lineTotalCents;

        calculatedLines.push({
          product_id: line.product_id,
          qty: line.qty,
          unit_price_cents: unit,
          vat_rate: rate,
          line_base_cents: br.lineBaseCents,
          line_vat_cents: br.lineVatCents,
          line_total_cents: br.lineTotalCents,
        });
      }

      // 2. Generar número correlativo
      const now = new Date();
      const year = now.getFullYear();
      const countRes = await tx`SELECT COUNT(*)::int as count FROM sales WHERE sold_at >= ${new Date(year, 0, 1)}`;
      const corr = String(countRes[0].count + 1).padStart(5, "0");
      const saleNumber = `V${year}-${corr}`;

      // 3. Crear venta
      const saleRes = await tx`
        INSERT INTO sales (customer_id, number, subtotal_cents, vat_cents, total_cents, notes, status, company_id)
        VALUES (${customer_id || null}, ${saleNumber}, ${subtotal}, ${totalVat}, ${total}, ${notes ?? ""}, 'completed', ${cid})
        RETURNING *
      `;
      const createdSale = saleRes[0];

      // 4. Crear líneas de venta y ajustar stock
      for (const cl of calculatedLines) {
        await tx`
          INSERT INTO sale_lines (sale_id, product_id, qty, unit_price_cents, vat_rate, line_base_cents, line_vat_cents, line_total_cents)
          VALUES (${createdSale.id}, ${cl.product_id}, ${cl.qty}, ${cl.unit_price_cents}, ${cl.vat_rate}, ${cl.line_base_cents}, ${cl.line_vat_cents}, ${cl.line_total_cents})
        `;

        await tx`
          UPDATE products
          SET stock = stock - ${cl.qty}, updated_at = ${now}
          WHERE id = ${cl.product_id}
        `;

        await tx`
          INSERT INTO stock_movements (product_id, delta, reason, ref_type, ref_id)
          VALUES (${cl.product_id}, ${-cl.qty}, 'Venta', 'sale', ${createdSale.id})
        `;
      }

      // 5. Registrar movimiento de caja
      await tx`
        INSERT INTO cash_movements (kind, amount_cents, category, description, sale_id)
        VALUES ('income', ${total}, 'ventas', ${`Venta ${saleNumber}`}, ${createdSale.id})
      `;

      return createdSale;
    });

    return this.get_sale(sale.id, token);
  },

  async list_sales(token: string | null): Promise<Sale[]> {
    const user = await requireSession(token);
    if (!token) throw new Error("Sesión no iniciada");
    const cid = await resolveActiveCompanyId(token, user.id);
    const sales = await sql`
      SELECT s.*, c.name as customer_name
      FROM sales s
      LEFT JOIN customers c ON s.customer_id = c.id
      WHERE s.company_id = ${cid}
      ORDER BY s.sold_at DESC
    `;
    return sales.map((s) => ({
      id: s.id,
      company_id: s.company_id,
      customer_id: s.customer_id,
      customer_name: s.customer_name || undefined,
      number: s.number,
      sold_at: toIso(s.sold_at),
      subtotal_cents: s.subtotal_cents,
      vat_cents: s.vat_cents,
      total_cents: s.total_cents,
      refunded_cents: s.refunded_cents ?? 0,
      notes: s.notes,
      status: s.status,
    }));
  },

  async get_sale(id: number, token: string | null): Promise<Sale> {
    await requireSession(token);
    const saleRes = await sql`
      SELECT s.*, c.name as customer_name
      FROM sales s
      LEFT JOIN customers c ON s.customer_id = c.id
      WHERE s.id = ${id}
    `;
    if (saleRes.length === 0) throw new Error("Venta no encontrada");
    const s = saleRes[0];

    const lines = await sql`
      SELECT sl.*, p.name as product_name
      FROM sale_lines sl
      JOIN products p ON sl.product_id = p.id
      WHERE sl.sale_id = ${id}
    `;

    return {
      id: s.id,
      customer_id: s.customer_id,
      customer_name: s.customer_name || undefined,
      number: s.number,
      sold_at: toIso(s.sold_at),
      subtotal_cents: s.subtotal_cents,
      vat_cents: s.vat_cents,
      total_cents: s.total_cents,
      refunded_cents: s.refunded_cents ?? 0,
      notes: s.notes,
      status: s.status,
      lines: lines.map((l) => ({
        id: l.id,
        sale_id: l.sale_id,
        product_id: l.product_id,
        product_name: l.product_name,
        qty: l.qty,
        returned_qty: l.returned_qty ?? 0,
        unit_price_cents: l.unit_price_cents,
        vat_rate: l.vat_rate,
        line_base_cents: l.line_base_cents,
        line_vat_cents: l.line_vat_cents,
        line_total_cents: l.line_total_cents,
      })),
    };
  },

  async return_sale_lines(
    id: number,
    requests: ReturnLineInput[],
    token: string | null,
  ): Promise<Sale> {
    await requireSession(token);
    const now = new Date();

    await sql.begin(async (tx) => {
      const saleRes = await tx`SELECT * FROM sales WHERE id = ${id}`;
      if (saleRes.length === 0) throw new Error("Venta no encontrada");
      const s = saleRes[0];
      const lines = await tx`SELECT * FROM sale_lines WHERE sale_id = ${id}`;
      const plan = planPartialReturn(
        {
          id: s.id,
          number: s.number,
          status: s.status,
          total_cents: s.total_cents,
          refunded_cents: s.refunded_cents ?? 0,
        },
        lines.map((l) => ({
          id: l.id,
          product_id: l.product_id,
          qty: l.qty,
          returned_qty: l.returned_qty ?? 0,
          line_total_cents: l.line_total_cents,
          line_base_cents: l.line_base_cents,
          line_vat_cents: l.line_vat_cents,
        })),
        requests,
      );

      for (const pl of plan.lines) {
        await tx`
          UPDATE sale_lines SET returned_qty = ${pl.new_returned_qty} WHERE id = ${pl.line_id}
        `;
      }
      for (const r of plan.stock_restores) {
        await tx`
          UPDATE products SET stock = stock + ${r.qty}, updated_at = ${now} WHERE id = ${r.product_id}
        `;
        await tx`
          INSERT INTO stock_movements (product_id, delta, reason, ref_type, ref_id)
          VALUES (${r.product_id}, ${r.qty}, ${plan.cash_description}, 'sale', ${id})
        `;
      }
      await tx`
        UPDATE sales
        SET status = ${plan.new_status}, refunded_cents = ${plan.new_refunded_cents}
        WHERE id = ${id}
      `;
      await tx`
        INSERT INTO cash_movements (kind, amount_cents, category, description, sale_id)
        VALUES ('expense', ${plan.cash_expense_cents}, ${plan.cash_category}, ${plan.cash_description}, ${id})
      `;
    });

    return this.get_sale(id, token);
  },

  async cancel_sale(id: number, token: string | null): Promise<Sale> {
    await requireSession(token);
    const saleRes = await sql`SELECT * FROM sales WHERE id = ${id}`;
    if (saleRes.length === 0) throw new Error("Venta no encontrada");
    if (saleRes[0].status === "cancelled") throw new Error("La venta ya está cancelada");
    const lines = await sql`SELECT id, qty, returned_qty FROM sale_lines WHERE sale_id = ${id}`;
    const requests: ReturnLineInput[] = lines
      .map((l) => ({
        line_id: l.id as number,
        qty: Math.max(0, (l.qty as number) - ((l.returned_qty as number) ?? 0)),
      }))
      .filter((r) => r.qty > 0);
    if (!requests.length) throw new Error("La venta ya está anulada");
    return this.return_sale_lines(id, requests, token);
  },

  async list_cash_movements(token: string | null): Promise<CashMovement[]> {
    await requireSession(token);
    const movements = await sql`
      SELECT cm.*, s.number as sale_number
      FROM cash_movements cm
      LEFT JOIN sales s ON cm.sale_id = s.id
      ORDER BY cm.occurred_at DESC
    `;
    return movements.map((m) => ({
      id: m.id,
      kind: m.kind,
      amount_cents: m.amount_cents,
      category: m.category,
      description: m.description ?? "",
      sale_id: m.sale_id ?? null,
      sale_number: m.sale_number || undefined,
      occurred_at: toIso(m.occurred_at),
    }));
  },

  async create_cash_movement(input: CashInput, token: string | null): Promise<CashMovement> {
    await requireSession(token);
    if (input.amount_cents <= 0) throw new Error("El importe debe ser mayor que cero");

    const res = await sql`
      INSERT INTO cash_movements (kind, amount_cents, category, description)
      VALUES (${input.kind}, ${input.amount_cents}, ${input.category || "otros"}, ${input.description || ""})
      RETURNING *
    `;
    const m = res[0];
    return {
      id: m.id,
      kind: m.kind,
      amount_cents: m.amount_cents,
      category: m.category,
      description: m.description ?? "",
      sale_id: m.sale_id ?? null,
      occurred_at: toIso(m.occurred_at),
    };
  },

  async get_cash_balance(token: string | null): Promise<number> {
    await requireSession(token);
    const res = await sql`
      SELECT COALESCE(
        SUM(CASE WHEN kind = 'expense' THEN -ABS(amount_cents) ELSE ABS(amount_cents) END),
        0
      )::int as balance
      FROM cash_movements
    `;
    return res[0].balance;
  },

  async vat_summary(from: string, to: string, token: string | null): Promise<VatSummary> {
    await requireSession(token);
    // completed + partially_returned; net amounts after returned_qty (ciclo 8)
    const lines = await sql`
      SELECT sl.id, sl.product_id, sl.qty, sl.returned_qty, sl.vat_rate,
             sl.line_base_cents, sl.line_vat_cents, sl.line_total_cents
      FROM sale_lines sl
      JOIN sales s ON sl.sale_id = s.id
      WHERE s.status IN ('completed', 'partially_returned')
        AND s.sold_at >= ${new Date(from)}
        AND s.sold_at <= ${new Date(to + "T23:59:59.999Z")}
    `;

    const bucketsMap = new Map<number, { base: number; vat: number; total: number }>();
    for (const rate of [0, 4, 10, 21]) {
      bucketsMap.set(rate, { base: 0, vat: 0, total: 0 });
    }
    let totalBase = 0;
    let totalVat = 0;
    let totalSales = 0;
    for (const l of lines) {
      const net = remainingLineAmounts({
        id: l.id,
        product_id: l.product_id,
        qty: l.qty,
        returned_qty: l.returned_qty ?? 0,
        line_total_cents: l.line_total_cents,
        line_base_cents: l.line_base_cents,
        line_vat_cents: l.line_vat_cents,
      });
      const rate = Number(l.vat_rate);
      const b = bucketsMap.get(rate) ?? { base: 0, vat: 0, total: 0 };
      b.base += net.base_cents;
      b.vat += net.vat_cents;
      b.total += net.total_cents;
      bucketsMap.set(rate, b);
      totalBase += net.base_cents;
      totalVat += net.vat_cents;
      totalSales += net.total_cents;
    }
    const buckets = [0, 4, 10, 21].map((vat_rate) => {
      const b = bucketsMap.get(vat_rate)!;
      return {
        vat_rate: vat_rate as 0 | 4 | 10 | 21,
        base_cents: b.base,
        vat_cents: b.vat,
        total_cents: b.total,
      };
    });

    return {
      from,
      to,
      buckets,
      base_cents: totalBase,
      vat_cents: totalVat,
      total_cents: totalSales,
    };
  },

  async dashboard_stats(token: string | null): Promise<DashboardStats & { sales_yesterday_cents?: number }> {
    await requireSession(token);
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);
    const monthStr = todayStr.slice(0, 7);
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().slice(0, 10);

    const startToday = new Date(todayStr + "T00:00:00.000Z");
    const endToday = new Date(todayStr + "T23:59:59.999Z");
    const startYesterday = new Date(yesterdayStr + "T00:00:00.000Z");
    const endYesterday = new Date(yesterdayStr + "T23:59:59.999Z");
    const startMonth = new Date(monthStr + "-01T00:00:00.000Z");

    // Net revenue = total_cents - refunded_cents; include partial returns
    const todayRes = await sql`
      SELECT COALESCE(SUM(total_cents - COALESCE(refunded_cents, 0)), 0)::int as total,
             COUNT(*)::int as count
      FROM sales
      WHERE status IN ('completed', 'partially_returned')
        AND sold_at >= ${startToday} AND sold_at <= ${endToday}
    `;

    const yesterdayRes = await sql`
      SELECT COALESCE(SUM(total_cents - COALESCE(refunded_cents, 0)), 0)::int as total,
             COUNT(*)::int as count
      FROM sales
      WHERE status IN ('completed', 'partially_returned')
        AND sold_at >= ${startYesterday} AND sold_at <= ${endYesterday}
    `;

    const monthRes = await sql`
      SELECT
        COALESCE(SUM(total_cents - COALESCE(refunded_cents, 0)), 0)::int as total,
        COALESCE(SUM(vat_cents), 0)::int as vat,
        COALESCE(SUM(subtotal_cents), 0)::int as base,
        COUNT(*)::int as count
      FROM sales
      WHERE status IN ('completed', 'partially_returned') AND sold_at >= ${startMonth}
    `;

    const cash = await this.get_cash_balance(token);

    const lowRows = await sql`
      SELECT *
      FROM products
      WHERE active = TRUE AND stock <= min_stock
      ORDER BY stock ASC, name ASC
    `;

    const low_stock: Product[] = lowRows.map((p) => ({
      id: p.id,
      sku: p.sku,
      name: p.name,
      description: p.description,
      category: p.category ?? "",
      stock: p.stock,
      min_stock: p.min_stock,
      cost_cents: p.cost_cents,
      price_cents: p.price_cents,
      vat_rate: p.vat_rate,
      active: !!p.active,
      created_at: toIso(p.created_at),
      updated_at: toIso(p.updated_at),
    }));

    return {
      sales_today_cents: todayRes[0].total,
      sales_today_count: todayRes[0].count,
      sales_month_cents: monthRes[0].total,
      sales_month_count: monthRes[0].count,
      cash_balance_cents: cash,
      low_stock,
      vat_month_cents: monthRes[0].vat,
      base_month_cents: monthRes[0].base,
      // Extra for AI context (not required by UI type)
      sales_yesterday_cents: yesterdayRes[0].total,
    };
  },

  async get_settings(token: string | null): Promise<Settings> {
    await requireSession(token);
    const rows = await sql`SELECT key, value FROM settings`;
    const settingsMap = new Map(rows.map((r) => [r.key, r.value]));

    return {
      shop_name: settingsMap.get("shop_name") || "Mi Tienda",
      ollama_model: settingsMap.get("ollama_model") || "qwen3.5:4b",
      ollama_url: settingsMap.get("ollama_url") || "http://127.0.0.1:11434",
      default_vat: (() => {
        const n = Number(settingsMap.get("default_vat") || "21");
        return isVatRate(n) ? n : 21;
      })(),
    };
  },

  async update_settings(partial: Partial<Settings>, token: string | null): Promise<Settings> {
    await requireSession(token);
    for (const [key, value] of Object.entries(partial)) {
      if (value !== undefined) {
        await sql`
          INSERT INTO settings (key, value)
          VALUES (${key}, ${value.toString()})
          ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
        `;
      }
    }
    return this.get_settings(token);
  },

  async ai_chat(messages: AiMessage[], token: string | null): Promise<AiChatResult> {
    const me = await requireSession(token);
    const settings = await this.get_settings(token);

    const todayStr = new Date().toISOString().slice(0, 10);

    // Contexto compacto de negocio
    const stats = await this.dashboard_stats(token);
    const lowStockProds = await sql`
      SELECT name, stock, price_cents
      FROM products
      WHERE active = TRUE
      ORDER BY stock ASC
      LIMIT 10
    `;

    const context = {
      tienda: settings.shop_name,
      fecha_hoy: todayStr,
      ventas_hoy_eur: (stats.sales_today_cents / 100).toFixed(2),
      tickets_hoy: stats.sales_today_count,
      ventas_ayer_eur: ((stats.sales_yesterday_cents ?? 0) / 100).toFixed(2),
      ventas_mes_eur: (stats.sales_month_cents / 100).toFixed(2),
      tickets_mes: stats.sales_month_count,
      caja_eur: (stats.cash_balance_cents / 100).toFixed(2),
      iva_mes_eur: (stats.vat_month_cents / 100).toFixed(2),
      productos_bajo_stock: lowStockProds.map(
        (p) => `${p.name} (${p.stock} uds - ${(p.price_cents / 100).toFixed(2)}€)`,
      ),
    };

    const systemPrompt = `Te llamas Lucía y eres la asistente virtual inteligente de la tienda "${settings.shop_name}" en España. 
Responde siempre en español, de manera concisa, técnica y con un tono profesional pero cercano y de chica.
Tus habilidades en este CRM incluyen:
- Gestionar y supervisar el inventario (alertar sobre existencias bajas).
- Analizar estadísticas de ventas del día, comparativa con el ayer y consolidados mensuales.
- Controlar movimientos de efectivo e ingresos de caja.
- Calcular desgloses de impuestos e IVA (0%, 4%, 10%, 21% de España).
- Apoyar en operaciones de ventas y facturación de mostrador.
Precios en EUR con IVA incluido. Contexto de negocio actual (JSON compacto): ${JSON.stringify(context)}.
No inventes datos fuera de este contexto. Si falta información, indícalo educadamente.`;

    const payloadMsgs = [
      { role: "system", content: systemPrompt },
      ...messages.map((m) => ({ role: m.role, content: m.content })),
    ];

    const url = `${settings.ollama_url.replace(/\/$/, "")}/api/chat`;
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(ollamaChatBody(settings.ollama_model, payloadMsgs, { num_predict: 96 })),
      });

      if (!response.ok) {
        const body = await response.text().catch(() => "");
        return {
          reply: `Error de conexión con Ollama (HTTP ${response.status})${body ? `: ${body.slice(0, 160)}` : ""}.`,
          model: settings.ollama_model,
          offline: true,
        };
      }

      const data = await response.json();
      if (data.error) {
        return {
          reply: `Error de Ollama: ${data.error}`,
          model: settings.ollama_model,
          offline: true,
        };
      }
      return {
        reply: extractOllamaReply(data.message),
        model: data.model || settings.ollama_model,
        offline: false,
      };
    } catch {
      return {
        reply: "No se puede conectar con el servicio local de Ollama. Asegúrate de tener Ollama activo y el modelo correspondiente descargado.",
        model: settings.ollama_model,
        offline: true,
      };
    }
  },

  async ollama_health(token: string | null): Promise<{ ok: boolean; models: string[] }> {
    await requireSession(token);
    const settings = await this.get_settings(token);
    const url = `${settings.ollama_url.replace(/\/$/, "")}/api/tags`;

    try {
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        const models = data.models?.map((m: any) => m.name) || [];
        return { ok: true, models };
      }
      return { ok: false, models: [] };
    } catch {
      return { ok: false, models: [] };
    }
  },

  async reset_demo(token: string | null): Promise<void> {
    await requireAdmin(token);
    // Truncar tablas y volver a sembrar
    await sql`TRUNCATE TABLE sessions, cash_movements, sale_lines, sales, stock_movements, products, customers RESTART IDENTITY CASCADE`;
    await seedProductsAndCustomers();
  },

  async export_backup(token: string | null): Promise<BackupEnvelope> {
    await requireAdmin(token);
    const [products, customers, sales, sale_lines, cash_movements, stock_movements, settings, users] =
      await Promise.all([
        sql`SELECT * FROM products ORDER BY id`,
        sql`SELECT * FROM customers ORDER BY id`,
        sql`SELECT * FROM sales ORDER BY id`,
        sql`SELECT * FROM sale_lines ORDER BY id`,
        sql`SELECT * FROM cash_movements ORDER BY id`,
        sql`SELECT * FROM stock_movements ORDER BY id`,
        sql`SELECT * FROM settings ORDER BY key`,
        sql`SELECT id, username, display_name, role, active, created_at, must_change_password, temp_password_issued_at FROM users ORDER BY id`,
      ]);
    return createBackupEnvelope({
      backend: "postgres",
      products,
      customers,
      sales,
      sale_lines,
      cash_movements,
      stock_movements,
      settings,
      users,
    });
  },

  async pre_migration_backup(reason: string, token: string | null): Promise<BackupEnvelope> {
    await requireAdmin(token);
    const full = await this.export_backup(token);
    return createPreMigrationBackup(full.payload, reason);
  },

  async restore_backup(raw: unknown, token: string | null): Promise<void> {
    await requireAdmin(token);
    const v = await validateBackup(raw);
    if (!v.ok) throw new Error(v.error);
    const p = v.envelope.payload as { backend?: string; products?: unknown[] };
    if (!p || p.backend !== "postgres" || !Array.isArray(p.products)) {
      throw new Error(
        "Copia inválida o de otro backend. Restaura copias Postgres con este endpoint; localStorage usa la app browser.",
      );
    }
    // Conservative: full restore is destructive; require explicit structure
    throw new Error(
      "Restauración completa Postgres desde UI desactivada por seguridad. Usa docs/BACKUP.md (pg_dump) o un runbook admin.",
    );
  },
};

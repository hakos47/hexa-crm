import postgres from "postgres";
import { hashPin, verifyCredential } from "../auth/pin";
import { browserApi } from "./browser-store";
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
import {
  encryptSecret,
  decryptSecret,
} from "../plugins/secret-vault";
import type {
  AiChatResult,
  AiMessage,
  AuthUser,
  CashInput,
  CashMovement,
  Company,
  CreateInventoryMovementInput,
  CreateUserResult,
  Customer,
  CustomerInput,
  DashboardStats,
  InventoryMovement,
  LoginResult,
  Product,
  ProductInput,
  PluginAuditLogEntry,
  PluginConfig,
  PluginKey,
  PluginLogResult,
  PluginTestResult,
  PluginToolResult,
  ReturnLineInput,
  Sale,
  SaleLineInput,
  Settings,
  StockBalance,
  StockLocation,
  TenantPlugin,
  UserInput,
  VatSummary,
  Warehouse,
  WorkCategory,
  WorkItem,
  WorkItemFilters,
  WorkItemInput,
  WorkMember,
  WorkProject,
  WorkProjectInput,
} from "../types";
import {
  billingByCompany,
  canAccessCompany,
  companiesForUser,
  companiesVisibleToUser,
  pickDefaultCompanyId,
  seedCompanies,
  seedCompanyMembers,
} from "../company/context";
import { planPartialReturn, remainingLineAmounts } from "../sales/partial-return";
import {
  PLUGIN_CATALOG,
  pluginDefinition,
  redactSensitive,
  sanitizePluginConfig,
  stripeToolAccess,
} from "../plugins/catalog";
import {
  callStripeTool,
  listStripeTools,
  pluginSecretConfigured,
  testDatabasePlugin,
  testStripePlugin,
} from "../plugins/runtime.server";

// Prefer Vite/SvelteKit private env; fall back to process.env and local Docker defaults.
function resolveDatabaseUrl(): string {
  const fromProcess =
    (typeof process !== "undefined" && process.env?.DATABASE_URL) || "";
  if (fromProcess) return fromProcess;
  // Default: Docker container `nix-c-postgres` (pgvector on host 5432)
  return "postgresql://hakos:nix_password@127.0.0.1:5432/nix_crm";
}

const DATABASE_URL = resolveDatabaseUrl();
export const CENTRAL_MODE = typeof process !== "undefined" && process.env?.HEXA_CENTRAL_MODE === "1";
export const CENTRAL_SCHEMA_VERSION = "0014_master_profile";

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
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      applied_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
    );
  `;
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
    CREATE TABLE IF NOT EXISTS service_request_replays (
      key_id TEXT NOT NULL,
      signature TEXT NOT NULL,
      expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
      PRIMARY KEY (key_id, signature)
    );
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS operator_accounts (
      id UUID PRIMARY KEY,
      company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      username TEXT NOT NULL,
      display_name TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('admin', 'cajero')),
      credential_hash TEXT NOT NULL,
      active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
      UNIQUE (company_id, username)
    );
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS operator_sessions (
      token_hash TEXT PRIMARY KEY,
      account_id UUID NOT NULL REFERENCES operator_accounts(id) ON DELETE CASCADE,
      company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
    );
  `;
  await sql`CREATE INDEX IF NOT EXISTS operator_sessions_expiry_idx ON operator_sessions (expires_at)`;
  await sql`
    CREATE TABLE IF NOT EXISTS idempotency_keys (
      company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      operation TEXT NOT NULL,
      key TEXT NOT NULL,
      payload_hash TEXT NOT NULL,
      response JSONB NOT NULL,
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
      PRIMARY KEY (company_id, operation, key)
    );
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS service_audit_log (
      id BIGSERIAL PRIMARY KEY,
      company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      key_id TEXT NOT NULL,
      action TEXT NOT NULL,
      request_id TEXT NOT NULL,
      correlation_id TEXT,
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
    );
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS semantic_documents (
      id UUID PRIMARY KEY,
      company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      entity_type TEXT NOT NULL CHECK (entity_type IN ('product', 'evidence', 'proposal', 'review')),
      entity_id TEXT NOT NULL,
      document_version TEXT NOT NULL,
      normalized_text TEXT NOT NULL,
      embedding vector(768),
      embedding_status TEXT NOT NULL DEFAULT 'pending' CHECK (embedding_status IN ('pending', 'ready', 'failed')),
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
      UNIQUE (company_id, entity_type, entity_id, document_version)
    );
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS semantic_metrics (
      id BIGSERIAL PRIMARY KEY,
      company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      operation TEXT NOT NULL CHECK (operation IN ('index', 'search')),
      outcome TEXT NOT NULL CHECK (outcome IN ('ready', 'failed')),
      latency_ms INTEGER NOT NULL CHECK (latency_ms >= 0),
      queue_depth INTEGER NOT NULL DEFAULT 0 CHECK (queue_depth >= 0),
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
    );
  `;
  await sql`CREATE INDEX IF NOT EXISTS semantic_metrics_tenant_created_idx ON semantic_metrics (company_id, created_at DESC)`;
  await sql`CREATE INDEX IF NOT EXISTS semantic_documents_tenant_entity_idx ON semantic_documents (company_id, entity_type, updated_at DESC)`;
  await sql`
    CREATE TABLE IF NOT EXISTS reservations (
      id UUID PRIMARY KEY,
      company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      status TEXT NOT NULL CHECK (status IN ('reserved', 'cancelled', 'expired', 'confirmed')),
      expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
      external_customer_id TEXT,
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
      cancelled_at TIMESTAMP WITH TIME ZONE
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
    CREATE TABLE IF NOT EXISTS reservation_lines (
      reservation_id UUID NOT NULL REFERENCES reservations(id) ON DELETE CASCADE,
      product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
      qty INTEGER NOT NULL CHECK (qty > 0),
      PRIMARY KEY (reservation_id, product_id)
    );
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS orders (
      id UUID PRIMARY KEY,
      company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      reservation_id UUID UNIQUE REFERENCES reservations(id) ON DELETE RESTRICT,
      external_customer_id TEXT,
      status TEXT NOT NULL CHECK (status IN ('pending', 'paid', 'processing', 'shipped', 'completed', 'cancelled')),
      total_cents INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
    );
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS order_lines (
      order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
      qty INTEGER NOT NULL CHECK (qty > 0),
      unit_price_cents INTEGER NOT NULL,
      vat_rate INTEGER NOT NULL DEFAULT 21,
      PRIMARY KEY (order_id, product_id)
    );
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS stock_movements (
      id SERIAL PRIMARY KEY,
      product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      company_id INTEGER NOT NULL DEFAULT 1 REFERENCES companies(id) ON DELETE CASCADE,
      delta INTEGER NOT NULL,
      reason TEXT NOT NULL DEFAULT '',
      ref_type TEXT,
      ref_id INTEGER,
      ref_key TEXT,
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
    CREATE TABLE IF NOT EXISTS external_customer_identities (
      company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      source TEXT NOT NULL,
      external_user_id TEXT NOT NULL,
      customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
      PRIMARY KEY (company_id, source, external_user_id)
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
      temp_password_issued_at TIMESTAMP WITH TIME ZONE,
      is_master BOOLEAN NOT NULL DEFAULT FALSE
    );
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
    );
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS tenant_plugins (
      company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      plugin_key TEXT NOT NULL,
      enabled BOOLEAN NOT NULL DEFAULT FALSE,
      config JSONB NOT NULL DEFAULT '{}'::jsonb,
      last_error TEXT,
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
      PRIMARY KEY (company_id, plugin_key)
    )
  `;
  await sql`ALTER TABLE tenant_plugins ADD COLUMN IF NOT EXISTS encrypted_secret TEXT`;
  await sql`
    CREATE TABLE IF NOT EXISTS plugin_audit_log (
      id BIGSERIAL PRIMARY KEY,
      company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      plugin_key TEXT NOT NULL,
      action TEXT NOT NULL,
      tool_name TEXT,
      result TEXT NOT NULL DEFAULT 'ok',
      summary TEXT,
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
    )
  `;
  await sql`ALTER TABLE plugin_audit_log ADD COLUMN IF NOT EXISTS result TEXT NOT NULL DEFAULT 'ok'`;
  await sql`ALTER TABLE plugin_audit_log ADD COLUMN IF NOT EXISTS summary TEXT`;

  // Multi-empresa columns (idempotent)
  await sql`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS active_company_id INTEGER`;
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS is_master BOOLEAN NOT NULL DEFAULT FALSE`;
  await sql`ALTER TABLE products ADD COLUMN IF NOT EXISTS company_id INTEGER NOT NULL DEFAULT 1`;
  await sql`ALTER TABLE customers ADD COLUMN IF NOT EXISTS company_id INTEGER NOT NULL DEFAULT 1`;
  await sql`ALTER TABLE sales ADD COLUMN IF NOT EXISTS company_id INTEGER NOT NULL DEFAULT 1`;
  await sql`ALTER TABLE cash_movements ADD COLUMN IF NOT EXISTS company_id INTEGER NOT NULL DEFAULT 1`;
  // Central catalog metadata. Existing local products remain published by default.
  await sql`ALTER TABLE products ADD COLUMN IF NOT EXISTS publication_status TEXT NOT NULL DEFAULT 'published'`;
  await sql`ALTER TABLE products ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'EUR'`;
  await sql`ALTER TABLE products ADD COLUMN IF NOT EXISTS condition_code TEXT NOT NULL DEFAULT 'preowned'`;
  // Perfil de abastecimiento del catálogo. Es deliberadamente por producto en
  // P0; la relación N:M proveedor-producto y recepciones llegan en la siguiente
  // fase sin impedir que la tienda sepa hoy de dónde y cómo se sirve cada SKU.
  await sql`ALTER TABLE products ADD COLUMN IF NOT EXISTS supplier_name TEXT NOT NULL DEFAULT ''`;
  await sql`ALTER TABLE products ADD COLUMN IF NOT EXISTS supplier_contact TEXT NOT NULL DEFAULT ''`;
  await sql`ALTER TABLE products ADD COLUMN IF NOT EXISTS supplier_email TEXT NOT NULL DEFAULT ''`;
  await sql`ALTER TABLE products ADD COLUMN IF NOT EXISTS supplier_phone TEXT NOT NULL DEFAULT ''`;
  await sql`ALTER TABLE products ADD COLUMN IF NOT EXISTS fulfillment_mode TEXT NOT NULL DEFAULT 'own_stock'`;
  await sql`ALTER TABLE products ADD COLUMN IF NOT EXISTS stock_location TEXT NOT NULL DEFAULT 'Almacén principal'`;
  await sql`CREATE TABLE IF NOT EXISTS suppliers (id SERIAL PRIMARY KEY, company_id INTEGER NOT NULL DEFAULT 1 REFERENCES companies(id) ON DELETE CASCADE, name TEXT NOT NULL, contact TEXT NOT NULL DEFAULT '', email TEXT NOT NULL DEFAULT '', phone TEXT NOT NULL DEFAULT '', ordering_method TEXT NOT NULL DEFAULT 'email', notes TEXT NOT NULL DEFAULT '', active BOOLEAN NOT NULL DEFAULT TRUE, created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(), updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(), UNIQUE(company_id, name))`;
  await sql`ALTER TABLE products ADD COLUMN IF NOT EXISTS image_url TEXT NOT NULL DEFAULT ''`;
  await sql`ALTER TABLE products ADD COLUMN IF NOT EXISTS evidence JSONB NOT NULL DEFAULT '[]'::jsonb`;
  await sql`ALTER TABLE products DROP CONSTRAINT IF EXISTS products_sku_key`;
  await sql`ALTER TABLE products DROP CONSTRAINT IF EXISTS products_company_sku_key`;
  await sql`ALTER TABLE products ADD CONSTRAINT products_company_sku_key UNIQUE (company_id, sku)`;
  await sql`ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS company_id INTEGER NOT NULL DEFAULT 1 REFERENCES companies(id) ON DELETE CASCADE`;
  await sql`ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS ref_key TEXT`;
  await sql`ALTER TABLE order_lines ADD COLUMN IF NOT EXISTS vat_rate INTEGER NOT NULL DEFAULT 21`;
  await sql`ALTER TABLE sales ADD COLUMN IF NOT EXISTS order_id UUID UNIQUE REFERENCES orders(id) ON DELETE SET NULL`;
  await sql`ALTER TABLE products DROP CONSTRAINT IF EXISTS products_publication_status_check`;
  await sql`ALTER TABLE products ADD CONSTRAINT products_publication_status_check CHECK (publication_status IN ('draft', 'published', 'archived'))`;
  await sql`
    CREATE TABLE IF NOT EXISTS integration_events (
      id BIGSERIAL PRIMARY KEY,
      company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      correlation_id TEXT,
      request_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      status TEXT NOT NULL,
      tool_name TEXT,
      summary TEXT,
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS integration_events_tenant_created_idx ON integration_events (company_id, id ASC)`;
  await sql`CREATE INDEX IF NOT EXISTS integration_events_tenant_corr_idx ON integration_events (company_id, correlation_id)`;

  // Defense in depth for central API roles. Requests set app.company_id locally.
  for (const table of ["products", "customers", "sales", "cash_movements", "reservations", "orders", "external_customer_identities", "semantic_documents", "semantic_metrics", "idempotency_keys", "service_audit_log", "plugin_audit_log", "tenant_plugins", "integration_events"] as const) {
    const policy = `${table}_tenant_isolation`;
    await sql.unsafe(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`);
    await sql.unsafe(`DROP POLICY IF EXISTS ${policy} ON ${table}`);
    await sql.unsafe(`CREATE POLICY ${policy} ON ${table} USING (company_id = NULLIF(current_setting('app.company_id', true), '')::integer) WITH CHECK (company_id = NULLIF(current_setting('app.company_id', true), '')::integer)`);
  }
  // Child rows inherit tenant scope from their parent. These policies prevent a
  // direct query against a line table from bypassing the parent's RLS policy.
  await sql`ALTER TABLE reservation_lines ENABLE ROW LEVEL SECURITY`;
  await sql`DROP POLICY IF EXISTS reservation_lines_tenant_isolation ON reservation_lines`;
  await sql`CREATE POLICY reservation_lines_tenant_isolation ON reservation_lines USING (EXISTS (SELECT 1 FROM reservations WHERE reservations.id = reservation_lines.reservation_id AND reservations.company_id = NULLIF(current_setting('app.company_id', true), '')::integer)) WITH CHECK (EXISTS (SELECT 1 FROM reservations WHERE reservations.id = reservation_lines.reservation_id AND reservations.company_id = NULLIF(current_setting('app.company_id', true), '')::integer))`;
  await sql`ALTER TABLE order_lines ENABLE ROW LEVEL SECURITY`;
  await sql`DROP POLICY IF EXISTS order_lines_tenant_isolation ON order_lines`;
  await sql`CREATE POLICY order_lines_tenant_isolation ON order_lines USING (EXISTS (SELECT 1 FROM orders WHERE orders.id = order_lines.order_id AND orders.company_id = NULLIF(current_setting('app.company_id', true), '')::integer)) WITH CHECK (EXISTS (SELECT 1 FROM orders WHERE orders.id = order_lines.order_id AND orders.company_id = NULLIF(current_setting('app.company_id', true), '')::integer))`;
  // Partial returns (ciclo 8)
  await sql`ALTER TABLE sales ADD COLUMN IF NOT EXISTS refunded_cents INTEGER NOT NULL DEFAULT 0`;
  await sql`ALTER TABLE sale_lines ADD COLUMN IF NOT EXISTS returned_qty INTEGER NOT NULL DEFAULT 0`;

  // Módulo Trabajo (Multiempresa) DDL
  await sql`
    CREATE TABLE IF NOT EXISTS work_categories (
      id SERIAL PRIMARY KEY,
      company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      normalized_name TEXT NOT NULL,
      color TEXT NOT NULL DEFAULT '#6b7280',
      archived_at TIMESTAMP WITH TIME ZONE,
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
      CONSTRAINT work_categories_company_normalized_unique UNIQUE (company_id, normalized_name)
    );
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS work_projects (
      id SERIAL PRIMARY KEY,
      company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned', 'active', 'paused', 'done', 'archived')),
      start_date TIMESTAMP WITH TIME ZONE,
      target_date TIMESTAMP WITH TIME ZONE,
      created_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
    );
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS work_items (
      id SERIAL PRIMARY KEY,
      company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      category_id INTEGER REFERENCES work_categories(id) ON DELETE SET NULL,
      project_id INTEGER REFERENCES work_projects(id) ON DELETE SET NULL,
      assignee_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      type TEXT NOT NULL DEFAULT 'task' CHECK (type IN ('idea', 'task', 'issue', 'milestone')),
      status TEXT NOT NULL DEFAULT 'inbox' CHECK (status IN ('inbox', 'planned', 'in_progress', 'blocked', 'done', 'archived')),
      priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
      start_date TIMESTAMP WITH TIME ZONE,
      due_date TIMESTAMP WITH TIME ZONE,
      sort_order INTEGER NOT NULL DEFAULT 0,
      source_type TEXT,
      source_key TEXT,
      source_href TEXT,
      completed_at TIMESTAMP WITH TIME ZONE,
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
    );
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_work_categories_company ON work_categories(company_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_work_projects_company ON work_projects(company_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_work_items_company ON work_items(company_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_work_items_category ON work_items(category_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_work_items_project ON work_items(project_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_work_items_assignee ON work_items(assignee_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_work_items_source ON work_items(company_id, source_type, source_key)`;
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_work_items_active_source
    ON work_items (company_id, source_type, source_key)
    WHERE status NOT IN ('done', 'archived') AND source_type IS NOT NULL AND source_key IS NOT NULL
  `;

  for (const table of ["work_categories", "work_projects", "work_items"] as const) {
    const policy = `${table}_tenant_isolation`;
    await sql.unsafe(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`);
    await sql.unsafe(`DROP POLICY IF EXISTS ${policy} ON ${table}`);
    await sql.unsafe(`CREATE POLICY ${policy} ON ${table} USING (company_id = NULLIF(current_setting('app.company_id', true), '')::integer) WITH CHECK (company_id = NULLIF(current_setting('app.company_id', true), '')::integer)`);
  }

  // --- Inventory Foundation (Phase 1) ---
  await sql`
    CREATE TABLE IF NOT EXISTS warehouses (
      id SERIAL PRIMARY KEY,
      company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      code TEXT NOT NULL,
      name TEXT NOT NULL,
      is_default BOOLEAN NOT NULL DEFAULT FALSE,
      active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
      UNIQUE(company_id, code)
    );
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS stock_locations (
      id SERIAL PRIMARY KEY,
      warehouse_id INTEGER NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
      company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      code TEXT NOT NULL,
      name TEXT NOT NULL,
      is_default BOOLEAN NOT NULL DEFAULT FALSE,
      allow_negative_stock BOOLEAN NOT NULL DEFAULT FALSE,
      active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
      UNIQUE(company_id, warehouse_id, code)
    );
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS stock_balances (
      company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      location_id INTEGER NOT NULL REFERENCES stock_locations(id) ON DELETE CASCADE,
      on_hand INTEGER NOT NULL DEFAULT 0,
      reserved INTEGER NOT NULL DEFAULT 0,
      blocked INTEGER NOT NULL DEFAULT 0,
      incoming INTEGER NOT NULL DEFAULT 0,
      available INTEGER NOT NULL DEFAULT 0,
      updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
      PRIMARY KEY (company_id, product_id, location_id)
    );
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS inventory_movements (
      id SERIAL PRIMARY KEY,
      company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
      from_location_id INTEGER REFERENCES stock_locations(id) ON DELETE SET NULL,
      to_location_id INTEGER REFERENCES stock_locations(id) ON DELETE SET NULL,
      movement_type TEXT NOT NULL,
      qty INTEGER NOT NULL,
      cost_cents INTEGER NOT NULL DEFAULT 0,
      effective_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
      actor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      reason_code TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT '',
      ref_type TEXT NOT NULL DEFAULT '',
      ref_id INTEGER,
      idempotency_key TEXT,
      reversed_movement_id INTEGER REFERENCES inventory_movements(id) ON DELETE SET NULL,
      is_reversal BOOLEAN NOT NULL DEFAULT FALSE
    );
  `;

  await sql`CREATE INDEX IF NOT EXISTS idx_warehouses_company ON warehouses(company_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_stock_locations_company ON stock_locations(company_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_stock_locations_warehouse ON stock_locations(warehouse_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_stock_balances_product ON stock_balances(company_id, product_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_inventory_movements_company ON inventory_movements(company_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_inventory_movements_product ON inventory_movements(company_id, product_id)`;
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_inventory_movements_idempotency ON inventory_movements(company_id, idempotency_key) WHERE idempotency_key IS NOT NULL`;

  for (const table of ["warehouses", "stock_locations", "stock_balances", "inventory_movements"] as const) {
    const policy = `${table}_tenant_isolation`;
    await sql.unsafe(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`);
    await sql.unsafe(`DROP POLICY IF EXISTS ${policy} ON ${table}`);
    await sql.unsafe(`CREATE POLICY ${policy} ON ${table} USING (company_id = NULLIF(current_setting('app.company_id', true), '')::integer) WITH CHECK (company_id = NULLIF(current_setting('app.company_id', true), '')::integer)`);
  }

  // The local demo keeps its seed data. A central tenant service must start empty
  // and be provisioned explicitly; it must never leak demo rows into a tenant.
  if (!CENTRAL_MODE) {
    await seedSettings();
    await seedUsers();
    await seedCompaniesPg();
    await seedProductsAndCustomers();
  }

  await seedInventoryFoundation();

  await sql`INSERT INTO schema_migrations (version) VALUES (${CENTRAL_SCHEMA_VERSION}) ON CONFLICT (version) DO NOTHING`;
  await sql`INSERT INTO schema_migrations (version) VALUES ('0015_work_management') ON CONFLICT (version) DO NOTHING`;
  await sql`INSERT INTO schema_migrations (version) VALUES ('0016_inventory_foundation') ON CONFLICT (version) DO NOTHING`;
  await sql`INSERT INTO schema_migrations (version) VALUES ('0017_stripe_secret_vault') ON CONFLICT (version) DO NOTHING`;
  await sql`INSERT INTO schema_migrations (version) VALUES ('0018_integration_events') ON CONFLICT (version) DO NOTHING`;
}

async function seedInventoryFoundation() {
  const companies = await sql<{ id: number }[]>`SELECT id FROM companies`;
  for (const c of companies) {
    const companyId = c.id;

    // Ensure default warehouse ("Almacén Principal", code "WH-MAIN")
    const whRows = await sql<{ id: number }[]>`
      INSERT INTO warehouses (company_id, code, name, is_default, active)
      VALUES (${companyId}, 'WH-MAIN', 'Almacén Principal', TRUE, TRUE)
      ON CONFLICT (company_id, code) DO UPDATE SET is_default = TRUE, updated_at = NOW()
      RETURNING id
    `;
    let warehouseId = whRows[0]?.id;
    if (!warehouseId) {
      const existingWh = await sql<{ id: number }[]>`SELECT id FROM warehouses WHERE company_id = ${companyId} AND code = 'WH-MAIN'`;
      warehouseId = existingWh[0]?.id;
    }
    if (!warehouseId) continue;

    // Ensure default location ("Ubicación Principal", code "LOC-MAIN")
    const locRows = await sql<{ id: number }[]>`
      INSERT INTO stock_locations (warehouse_id, company_id, code, name, is_default, allow_negative_stock, active)
      VALUES (${warehouseId}, ${companyId}, 'LOC-MAIN', 'Ubicación Principal', TRUE, FALSE, TRUE)
      ON CONFLICT (company_id, warehouse_id, code) DO UPDATE SET is_default = TRUE, updated_at = NOW()
      RETURNING id
    `;
    let locationId = locRows[0]?.id;
    if (!locationId) {
      const existingLoc = await sql<{ id: number }[]>`
        SELECT id FROM stock_locations WHERE company_id = ${companyId} AND warehouse_id = ${warehouseId} AND code = 'LOC-MAIN'
      `;
      locationId = existingLoc[0]?.id;
    }
    if (!locationId) continue;

    // For any product with stock > 0, insert/seed initial balance into stock_balances and create an initial_stock movement idempotently.
    const products = await sql<{ id: number; stock: number; cost_cents: number }[]>`
      SELECT id, stock, cost_cents FROM products WHERE company_id = ${companyId} AND stock > 0
    `;

    for (const p of products) {
      const key = `initial_stock_${companyId}_${p.id}_${locationId}`;

      await sql`
        INSERT INTO stock_balances (company_id, product_id, location_id, on_hand, reserved, blocked, incoming, available, updated_at)
        VALUES (${companyId}, ${p.id}, ${locationId}, ${p.stock}, 0, 0, 0, ${p.stock}, NOW())
        ON CONFLICT (company_id, product_id, location_id) DO NOTHING
      `;

      await sql`
        INSERT INTO inventory_movements (
          company_id, product_id, from_location_id, to_location_id, movement_type, qty, cost_cents, reason_code, notes, idempotency_key
        )
        SELECT ${companyId}, ${p.id}, NULL, ${locationId}, 'initial_stock', ${p.stock}, ${p.cost_cents}, 'INITIAL_MIGRATION', 'Migración inicial de stock escalar', ${key}
        WHERE NOT EXISTS (
          SELECT 1 FROM inventory_movements WHERE company_id = ${companyId} AND idempotency_key = ${key}
        )
      `;
    }
  }
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

async function resolveActiveCompanyId(token: string | null, userId: number): Promise<number> {
  const companies = await loadCompanies();
  const members = await loadMembers();
  const accessible = companiesForUser(
    userId,
    members as { company_id: number; user_id: number; role: "admin" | "cajero" }[],
    companies,
  );
  const [sess, masterRows] = await Promise.all([
    sql`SELECT active_company_id FROM sessions WHERE token = ${token}`,
    sql`SELECT is_master FROM users WHERE id = ${userId}`,
  ]);
  const preferred = sess[0]?.active_company_id as number | null | undefined;
  const isMaster = !!masterRows[0]?.is_master;
  const masterPreferred = isMaster && preferred != null && companies.some((company) => company.id === preferred)
    ? preferred
    : null;
  const id = masterPreferred ?? pickDefaultCompanyId(accessible, preferred) ?? (isMaster ? companies[0]?.id ?? null : null);
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
    { key: "idle_timeout_minutes", value: "15" },
    { key: "last_backup_at", value: "" },
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
    SELECT s.token, u.id, u.username, u.display_name, u.role, u.active, u.created_at, u.must_change_password, u.temp_password_issued_at, u.is_master
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
    is_master: !!u.is_master,
  };
}

async function requireAdmin(token: string | null): Promise<AuthUser> {
  const u = await requireSession(token);
  if (u.role !== "admin") throw new Error("Se requieren permisos de administrador");
  return u;
}

async function requireAdminCategoryManagementPg(token: string | null): Promise<AuthUser> {
  const u = await requireSession(token);
  if (u.role !== "admin" && !u.is_master) {
    throw new Error("Solo los administradores pueden gestionar categorías.");
  }
  return u;
}

async function requireAdminProjectManagementPg(token: string | null): Promise<AuthUser> {
  const u = await requireSession(token);
  if (u.role !== "admin" && !u.is_master) {
    throw new Error("Solo los administradores pueden gestionar proyectos.");
  }
  return u;
}

function formatWorkProject(r: any): WorkProject {
  return {
    id: r.id,
    company_id: r.company_id,
    name: r.name,
    description: r.description ?? "",
    status: r.status,
    start_date: toIso(r.start_date) || null,
    target_date: toIso(r.target_date) || null,
    created_by: r.created_by,
    created_at: toIso(r.created_at),
    updated_at: toIso(r.updated_at),
  };
}

function formatWorkItem(r: any): WorkItem {
  return {
    id: r.id,
    company_id: r.company_id,
    category_id: r.category_id ?? null,
    project_id: r.project_id ?? null,
    assignee_id: r.assignee_id ?? null,
    created_by: r.created_by,
    title: r.title,
    description: r.description ?? "",
    type: r.type,
    status: r.status,
    priority: r.priority,
    start_date: toIso(r.start_date) || null,
    due_date: toIso(r.due_date) || null,
    sort_order: r.sort_order ?? 0,
    source_type: r.source_type ?? null,
    source_key: r.source_key ?? null,
    source_href: r.source_href ?? null,
    completed_at: toIso(r.completed_at) || null,
    created_at: toIso(r.created_at),
    updated_at: toIso(r.updated_at),
    category: r.category_name
      ? {
          id: r.category_id,
          company_id: r.company_id,
          name: r.category_name,
          normalized_name: r.category_normalized_name ?? r.category_name.toUpperCase(),
          color: r.category_color ?? "#6b7280",
          archived_at: toIso(r.category_archived_at) || null,
          created_at: toIso(r.category_created_at) || "",
          updated_at: toIso(r.category_updated_at) || "",
        }
      : null,
    assignee_name: r.assignee_name ?? null,
  };
}

async function tenantPluginRow(companyId: number, key: PluginKey) {
  const rows = await sql`
    SELECT enabled, config, encrypted_secret, last_error, updated_at
    FROM tenant_plugins
    WHERE company_id = ${companyId} AND plugin_key = ${key}
  `;
  return rows[0] ?? null;
}

async function tenantPlugin(companyId: number, key: PluginKey): Promise<TenantPlugin> {
  const definition = pluginDefinition(key);
  const row = await tenantPluginRow(companyId, key);
  const config = sanitizePluginConfig(key, row?.config ?? definition.defaultConfig);
  const enabled = !!row?.enabled;
  const secretConfigured = key === "stripe_mcp"
    ? !!row?.encrypted_secret
    : pluginSecretConfigured(config, "database");
  const lastLogRows = await sql`
    SELECT created_at FROM plugin_audit_log
    WHERE company_id = ${companyId} AND plugin_key = ${key}
    ORDER BY id DESC LIMIT 1
  `;
  const lastCheck = lastLogRows[0]?.created_at
    ? toIso(lastLogRows[0].created_at)
    : row?.updated_at
      ? toIso(row.updated_at)
      : null;

  return {
    plugin_key: key,
    name: definition.name,
    description: definition.description,
    category: definition.category,
    capabilities: [...definition.capabilities],
    enabled,
    config,
    secret_configured: secretConfigured,
    status: !enabled ? "inactive" : row?.last_error ? "error" : secretConfigured ? "ready" : "needs_secret",
    last_error: row?.last_error ?? null,
    last_check: lastCheck,
    updated_at: row?.updated_at ? toIso(row.updated_at) : null,
  };
}

async function pluginAudit(
  companyId: number,
  userId: number | null,
  key: PluginKey,
  action: string,
  toolName?: string | null,
  result: PluginLogResult = "ok",
  summary?: string | null,
) {
  const cleanSummary = redactSensitive(summary ?? "").slice(0, 255) || null;
  await sql`
    INSERT INTO plugin_audit_log (company_id, user_id, plugin_key, action, tool_name, result, summary)
    VALUES (${companyId}, ${userId}, ${key}, ${action}, ${toolName ?? null}, ${result}, ${cleanSummary})
  `;
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
      SELECT id, username, display_name, role, active, pin_hash, must_change_password, temp_password_issued_at, created_at, is_master
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
        is_master: !!user.is_master,
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

  async list_companies(token: string | null, includeAll = false): Promise<Company[]> {
    const user = await requireSession(token);
    const companies = await loadCompanies();
    const members = await loadMembers();
    if (includeAll && !user.is_master) throw new Error("Solo un perfil maestro puede ver todos los tenants");
    return companiesVisibleToUser(
      user.id,
      members as { company_id: number; user_id: number; role: "admin" | "cajero" }[],
      companies,
      { isMaster: !!user.is_master, includeAll },
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
        !!user.is_master,
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

  async list_plugins(token: string | null): Promise<TenantPlugin[]> {
    const user = await requireSession(token);
    if (!token) throw new Error("Sesión no iniciada");
    const companyId = await resolveActiveCompanyId(token, user.id);
    return Promise.all(PLUGIN_CATALOG.map((plugin) => tenantPlugin(companyId, plugin.key)));
  },

  async update_plugin(
    pluginKey: PluginKey,
    enabled: boolean,
    inputConfig: unknown,
    token: string | null,
    secretAction?: "save" | "replace" | "remove" | "keep",
    secretInput?: string | null,
  ): Promise<TenantPlugin> {
    const user = await requireAdmin(token);
    if (!token) throw new Error("Sesión no iniciada");
    pluginDefinition(pluginKey);
    const companyId = await resolveActiveCompanyId(token, user.id);
    const config = sanitizePluginConfig(pluginKey, inputConfig);

    const rawInput = inputConfig && typeof inputConfig === "object" ? (inputConfig as Record<string, unknown>) : {};
    const action = secretAction ?? (rawInput.secret_action as "save" | "replace" | "remove" | "keep" | undefined);
    const rawSecret = secretInput ?? (typeof rawInput.secret === "string" ? rawInput.secret : null);

    let encryptedSecret: string | null | undefined = undefined;

    if (pluginKey === "stripe_mcp" && action) {
      if (action === "save" || action === "replace") {
        if (!rawSecret || !rawSecret.trim()) {
          throw new Error("Debes proporcionar una credencial válida de Stripe");
        }
        encryptedSecret = encryptSecret(rawSecret.trim());
      } else if (action === "remove") {
        encryptedSecret = null;
      }
    }

    if (encryptedSecret !== undefined) {
      await sql`
        INSERT INTO tenant_plugins (company_id, plugin_key, enabled, config, encrypted_secret, last_error, updated_at)
        VALUES (${companyId}, ${pluginKey}, ${enabled}, ${sql.json(config as any)}, ${encryptedSecret}, NULL, NOW())
        ON CONFLICT (company_id, plugin_key) DO UPDATE SET
          enabled = EXCLUDED.enabled,
          config = EXCLUDED.config,
          encrypted_secret = EXCLUDED.encrypted_secret,
          last_error = NULL,
          updated_at = NOW()
      `;
    } else {
      await sql`
        INSERT INTO tenant_plugins (company_id, plugin_key, enabled, config, last_error, updated_at)
        VALUES (${companyId}, ${pluginKey}, ${enabled}, ${sql.json(config as any)}, NULL, NOW())
        ON CONFLICT (company_id, plugin_key) DO UPDATE SET
          enabled = EXCLUDED.enabled,
          config = EXCLUDED.config,
          last_error = NULL,
          updated_at = NOW()
      `;
    }

    const auditSummary = action === "remove"
      ? "Credencial de Stripe eliminada"
      : action === "replace"
        ? "Credencial de Stripe reemplazada"
        : action === "save"
          ? "Credencial de Stripe guardada"
          : enabled
            ? "Configuración guardada y plugin activado"
            : "Plugin desactivado";

    await pluginAudit(
      companyId,
      user.id,
      pluginKey,
      action === "remove" ? "secret_removed" : enabled ? "enabled_or_updated" : "disabled",
      null,
      "ok",
      auditSummary,
    );
    return tenantPlugin(companyId, pluginKey);
  },

  async test_plugin(pluginKey: PluginKey, token: string | null): Promise<PluginTestResult> {
    const user = await requireAdmin(token);
    if (!token) throw new Error("Sesión no iniciada");
    pluginDefinition(pluginKey);
    const companyId = await resolveActiveCompanyId(token, user.id);
    const plugin = await tenantPlugin(companyId, pluginKey);
    if (!plugin.enabled) {
      await pluginAudit(
        companyId,
        user.id,
        pluginKey,
        "connection_test_failed",
        null,
        "error",
        "Activa y guarda el plugin antes de probarlo",
      );
      throw new Error("Activa y guarda el plugin antes de probarlo");
    }

    let decryptedToken: string | undefined = undefined;

    if (pluginKey === "stripe_mcp") {
      const row = await tenantPluginRow(companyId, pluginKey);
      if (!row?.encrypted_secret) {
        const msg = "Ingresa y guarda la credencial de Stripe antes de probar la conexión";
        await pluginAudit(companyId, user.id, pluginKey, "connection_test_failed", null, "error", msg);
        throw new Error(msg);
      }
      decryptedToken = decryptSecret(row.encrypted_secret);
    }

    try {
      const result = pluginKey === "database_bridge"
        ? await testDatabasePlugin(plugin.config)
        : await testStripePlugin(plugin.config, decryptedToken);

      await sql`UPDATE tenant_plugins SET last_error = NULL, updated_at = NOW() WHERE company_id = ${companyId} AND plugin_key = ${pluginKey}`;
      await pluginAudit(companyId, user.id, pluginKey, "connection_test_ok", null, "ok", result.message);
      return result;
    } catch (error) {
      const message = redactSensitive(error instanceof Error ? error.message : "No se pudo conectar");
      await sql`UPDATE tenant_plugins SET last_error = ${message.slice(0, 500)}, updated_at = NOW() WHERE company_id = ${companyId} AND plugin_key = ${pluginKey}`;
      await pluginAudit(companyId, user.id, pluginKey, "connection_test_failed", null, "error", message);
      throw new Error(message);
    }
  },

  async list_plugin_tools(pluginKey: PluginKey, token: string | null): Promise<any[]> {
    const user = await requireSession(token);
    if (!token) throw new Error("Sesión no iniciada");
    if (pluginKey !== "stripe_mcp") return [];
    const companyId = await resolveActiveCompanyId(token, user.id);
    const plugin = await tenantPlugin(companyId, pluginKey);
    if (!plugin.enabled || !plugin.secret_configured) return [];
    const row = await tenantPluginRow(companyId, pluginKey);
    if (!row?.encrypted_secret) return [];
    const secretToken = decryptSecret(row.encrypted_secret);
    const tools = await listStripeTools(plugin.config, secretToken);
    return tools.filter((tool) => stripeToolAccess(String(tool?.name ?? ""), plugin.config).allowed);
  },

  async call_plugin_tool(
    pluginKey: PluginKey,
    toolName: string,
    args: Record<string, unknown>,
    confirmed: boolean,
    token: string | null,
  ): Promise<PluginToolResult> {
    const user = await requireSession(token);
    if (!token) throw new Error("Sesión no iniciada");
    if (pluginKey !== "stripe_mcp") throw new Error("Este plugin no expone herramientas al asistente");
    const companyId = await resolveActiveCompanyId(token, user.id);
    const plugin = await tenantPlugin(companyId, pluginKey);
    if (!plugin.enabled) {
      await pluginAudit(
        companyId,
        user.id,
        pluginKey,
        "tool_requested",
        toolName,
        "blocked",
        "El plugin Stripe MCP no está activo para esta tienda",
      );
      throw new Error("El plugin Stripe MCP no está activo para esta tienda");
    }
    const access = stripeToolAccess(toolName, plugin.config);
    if (!access.allowed) {
      await pluginAudit(
        companyId,
        user.id,
        pluginKey,
        "tool_blocked_permission",
        toolName,
        "blocked",
        "Herramienta de Stripe no permitida en este tenant",
      );
      throw new Error("Herramienta de Stripe no permitida en este tenant");
    }
    if (access.write) {
      if (user.role !== "admin") {
        await pluginAudit(
          companyId,
          user.id,
          pluginKey,
          "tool_blocked_permission",
          toolName,
          "blocked",
          "Las operaciones de Stripe requieren un administrador",
        );
        throw new Error("Las operaciones de Stripe requieren un administrador");
      }
      if (!confirmed) {
        await pluginAudit(
          companyId,
          user.id,
          pluginKey,
          "tool_blocked_approval",
          toolName,
          "blocked",
          "Esta operación necesita confirmación explícita",
        );
        throw new Error("Esta operación necesita confirmación explícita");
      }
    }
    const row = await tenantPluginRow(companyId, pluginKey);
    if (!row?.encrypted_secret) {
      throw new Error("No hay credencial de Stripe configurada para esta tienda");
    }
    const secretToken = decryptSecret(row.encrypted_secret);
    try {
      const result = await callStripeTool(plugin.config, toolName, args ?? {}, secretToken);
      await pluginAudit(
        companyId,
        user.id,
        pluginKey,
        access.write ? "tool_write" : "tool_read",
        toolName,
        "ok",
        `Ejecución exitosa de ${toolName}`,
      );
      return result;
    } catch (err) {
      const msg = redactSensitive(err instanceof Error ? err.message : String(err));
      await pluginAudit(companyId, user.id, pluginKey, "tool_error", toolName, "error", msg);
      throw err;
    }
  },

  async list_plugin_logs(
    pluginKey: PluginKey,
    limit = 20,
    token: string | null,
  ): Promise<PluginAuditLogEntry[]> {
    const user = await requireAdmin(token);
    if (!token) throw new Error("Sesión no iniciada");
    pluginDefinition(pluginKey);
    const companyId = await resolveActiveCompanyId(token, user.id);
    const maxLimit = Math.min(Math.max(1, limit), 100);

    const rows = await sql`
      SELECT l.id, l.company_id, l.user_id, u.display_name AS actor_name, l.plugin_key, l.action, l.tool_name, l.result, l.summary, l.created_at
      FROM plugin_audit_log l
      LEFT JOIN users u ON u.id = l.user_id
      WHERE l.company_id = ${companyId} AND l.plugin_key = ${pluginKey}
      ORDER BY l.id DESC
      LIMIT ${maxLimit}
    `;

    return rows.map((r) => ({
      id: Number(r.id),
      company_id: Number(r.company_id),
      user_id: r.user_id ? Number(r.user_id) : null,
      actor_name: r.actor_name ?? "Sistema",
      plugin_key: r.plugin_key as PluginKey,
      action: r.action,
      tool_name: r.tool_name ?? null,
      result: (r.result as PluginLogResult) || "ok",
      summary: r.summary ?? null,
      created_at: toIso(r.created_at),
    }));
  },

  async list_users(token: string | null): Promise<AuthUser[]> {
    await requireAdmin(token);
    const users = await sql`
      SELECT id, username, display_name, role, active, created_at, must_change_password, temp_password_issued_at, is_master
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
      is_master: !!u.is_master,
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
        RETURNING id, username, display_name, role, active, created_at, must_change_password, temp_password_issued_at, is_master
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
          is_master: !!u.is_master,
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
      RETURNING id, username, display_name, role, active, created_at, must_change_password, temp_password_issued_at, is_master
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
        is_master: !!u.is_master,
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
      RETURNING id, username, display_name, role, active, created_at, must_change_password, temp_password_issued_at, is_master
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
      is_master: !!u.is_master,
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
      supplier_name: p.supplier_name || "",
      supplier_contact: p.supplier_contact || "",
      supplier_email: p.supplier_email || "",
      supplier_phone: p.supplier_phone || "",
      fulfillment_mode: p.fulfillment_mode || "own_stock",
      stock_location: p.stock_location || "Almacén principal",
      condition_code: p.condition_code || "used",
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
          supplier_name = ${input.supplier_name ?? ""},
          supplier_contact = ${input.supplier_contact ?? ""},
          supplier_email = ${input.supplier_email ?? ""},
          supplier_phone = ${input.supplier_phone ?? ""},
          fulfillment_mode = ${input.fulfillment_mode ?? "own_stock"},
          stock_location = ${input.stock_location ?? "Almacén principal"},
          condition_code = ${input.condition_code ?? "used"},
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
        supplier_name: p.supplier_name || "",
        supplier_contact: p.supplier_contact || "",
        supplier_email: p.supplier_email || "",
        supplier_phone: p.supplier_phone || "",
        fulfillment_mode: p.fulfillment_mode || "own_stock",
        stock_location: p.stock_location || "Almacén principal",
        condition_code: p.condition_code || "used",
        active: !!p.active,
        created_at: toIso(p.created_at),
        updated_at: toIso(p.updated_at),
      };
    } else {
      // Create
      const res = await sql`
        INSERT INTO products (sku, name, description, category, stock, min_stock, cost_cents, price_cents, vat_rate, supplier_name, supplier_contact, supplier_email, supplier_phone, fulfillment_mode, stock_location, condition_code, active)
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
          ${input.supplier_name ?? ""},
          ${input.supplier_contact ?? ""},
          ${input.supplier_email ?? ""},
          ${input.supplier_phone ?? ""},
          ${input.fulfillment_mode ?? "own_stock"},
          ${input.stock_location ?? "Almacén principal"},
          ${input.condition_code ?? "used"},
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
        supplier_name: p.supplier_name || "",
        supplier_contact: p.supplier_contact || "",
        supplier_email: p.supplier_email || "",
        supplier_phone: p.supplier_phone || "",
        fulfillment_mode: p.fulfillment_mode || "own_stock",
        stock_location: p.stock_location || "Almacén principal",
        condition_code: p.condition_code || "used",
        active: !!p.active,
        created_at: toIso(p.created_at),
        updated_at: toIso(p.updated_at),
      };
    }
  },

  async list_suppliers(token: string | null) {
    const user = await requireSession(token); if (!token) throw new Error("Sesión no iniciada");
    const cid = await resolveActiveCompanyId(token, user.id);
    const rows = await sql`SELECT * FROM suppliers WHERE company_id = ${cid} ORDER BY name ASC`;
    return rows.map((s) => ({ id: s.id, company_id: s.company_id, name: s.name, contact: s.contact, email: s.email, phone: s.phone, ordering_method: s.ordering_method, notes: s.notes, active: !!s.active, created_at: toIso(s.created_at), updated_at: toIso(s.updated_at) }));
  },

  async upsert_supplier(input: { id?: number | null; name: string; contact?: string; email?: string; phone?: string; ordering_method?: string; notes?: string; active?: boolean }, token: string | null) {
    const user = await requireSession(token); if (!token) throw new Error("Sesión no iniciada"); const cid = await resolveActiveCompanyId(token, user.id); const now = new Date();
    const row = input.id
      ? (await sql`UPDATE suppliers SET name=${input.name}, contact=${input.contact ?? ""}, email=${input.email ?? ""}, phone=${input.phone ?? ""}, ordering_method=${input.ordering_method ?? "email"}, notes=${input.notes ?? ""}, active=${input.active ?? true}, updated_at=${now} WHERE id=${input.id} AND company_id=${cid} RETURNING *`)[0]
      : (await sql`INSERT INTO suppliers (company_id,name,contact,email,phone,ordering_method,notes,active) VALUES (${cid},${input.name},${input.contact ?? ""},${input.email ?? ""},${input.phone ?? ""},${input.ordering_method ?? "email"},${input.notes ?? ""},${input.active ?? true}) RETURNING *`)[0];
    if (!row) throw new Error("Proveedor no encontrado");
    return { id: row.id, company_id: row.company_id, name: row.name, contact: row.contact, email: row.email, phone: row.phone, ordering_method: row.ordering_method, notes: row.notes, active: !!row.active, created_at: toIso(row.created_at), updated_at: toIso(row.updated_at) };
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
    const user = await requireSession(token);
    if (!token) throw new Error("Sesión no iniciada");
    const cid = await resolveActiveCompanyId(token, user.id);
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
        AND company_id = ${cid}
        AND sold_at >= ${startToday} AND sold_at <= ${endToday}
    `;

    const yesterdayRes = await sql`
      SELECT COALESCE(SUM(total_cents - COALESCE(refunded_cents, 0)), 0)::int as total,
             COUNT(*)::int as count
      FROM sales
      WHERE status IN ('completed', 'partially_returned')
        AND company_id = ${cid}
        AND sold_at >= ${startYesterday} AND sold_at <= ${endYesterday}
    `;

    const monthRes = await sql`
      SELECT
        COALESCE(SUM(total_cents - COALESCE(refunded_cents, 0)), 0)::int as total,
        COALESCE(SUM(vat_cents), 0)::int as vat,
        COALESCE(SUM(subtotal_cents), 0)::int as base,
        COUNT(*)::int as count
      FROM sales
      WHERE status IN ('completed', 'partially_returned') AND company_id = ${cid} AND sold_at >= ${startMonth}
    `;

    const cash = await this.get_cash_balance(token);

    const lowRows = await sql`
      SELECT *
      FROM products
      WHERE active = TRUE AND company_id = ${cid} AND stock <= min_stock
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
      idle_timeout_minutes: (() => {
        const n = Number(settingsMap.get("idle_timeout_minutes") || "15");
        return Number.isInteger(n) && n >= 0 && n <= 480 ? n : 15;
      })(),
      last_backup_at: settingsMap.get("last_backup_at") || null,
    };
  },

  async update_settings(partial: Partial<Settings>, token: string | null): Promise<Settings> {
    await requireAdmin(token);
    const allowed: (keyof Settings)[] = [
      "shop_name",
      "ollama_model",
      "ollama_url",
      "default_vat",
      "idle_timeout_minutes",
      "last_backup_at",
    ];
    for (const key of allowed) {
      const value = partial[key];
      if (value !== undefined) {
        if (
          key === "idle_timeout_minutes" &&
          (!Number.isInteger(value) || Number(value) < 0 || Number(value) > 480)
        ) {
          throw new Error("El bloqueo automático debe estar entre 0 y 480 minutos");
        }
        await sql`
          INSERT INTO settings (key, value)
          VALUES (${key}, ${value == null ? "" : value.toString()})
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
    await sql`TRUNCATE TABLE sessions, work_items, work_projects, work_categories, cash_movements, sale_lines, sales, stock_movements, products, customers RESTART IDENTITY CASCADE`;
    await seedProductsAndCustomers();
  },

  async export_backup(token: string | null): Promise<BackupEnvelope> {
    await requireAdmin(token);
    const [products, customers, sales, sale_lines, cash_movements, stock_movements, settings, users, work_categories, work_projects, work_items] =
      await Promise.all([
        sql`SELECT * FROM products ORDER BY id`,
        sql`SELECT * FROM customers ORDER BY id`,
        sql`SELECT * FROM sales ORDER BY id`,
        sql`SELECT * FROM sale_lines ORDER BY id`,
        sql`SELECT * FROM cash_movements ORDER BY id`,
        sql`SELECT * FROM stock_movements ORDER BY id`,
        sql`SELECT * FROM settings ORDER BY key`,
        sql`SELECT id, username, display_name, role, active, created_at, must_change_password, temp_password_issued_at FROM users ORDER BY id`,
        sql`SELECT * FROM work_categories ORDER BY id`,
        sql`SELECT * FROM work_projects ORDER BY id`,
        sql`SELECT * FROM work_items ORDER BY id`,
      ]);
    const backup = await createBackupEnvelope({
      backend: "postgres",
      products,
      customers,
      sales,
      sale_lines,
      cash_movements,
      stock_movements,
      settings,
      users,
      work_categories,
      work_projects,
      work_items,
    });
    await sql`
      INSERT INTO settings (key, value) VALUES ('last_backup_at', ${backup.created_at})
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
    `;
    return backup;
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

  /* -------------------------------------------------------------
     Módulo Trabajo (Multiempresa) PostgreSQL Implementation
     ------------------------------------------------------------- */

  async listWorkProjects(status_filter?: string, token?: string | null): Promise<WorkProject[]> {
    const user = await requireSession(token ?? null);
    const companyId = await resolveActiveCompanyId(token ?? null, user.id);

    let query = sql`
      SELECT * FROM work_projects
      WHERE company_id = ${companyId}
    `;
    if (status_filter && status_filter.trim() !== "" && status_filter !== "all") {
      query = sql`${query} AND status = ${status_filter.trim()}`;
    }
    query = sql`${query} ORDER BY created_at DESC, id DESC`;
    const rows = await query;
    return rows.map(formatWorkProject);
  },

  async getWorkProject(id: number, token?: string | null): Promise<WorkProject> {
    const user = await requireSession(token ?? null);
    const companyId = await resolveActiveCompanyId(token ?? null, user.id);

    const rows = await sql`
      SELECT * FROM work_projects
      WHERE id = ${id} AND company_id = ${companyId}
    `;
    if (rows.length === 0) throw new Error("Proyecto no encontrado.");
    return formatWorkProject(rows[0]);
  },

  async upsertWorkProject(input: WorkProjectInput, token?: string | null): Promise<WorkProject> {
    const user = await requireAdminProjectManagementPg(token ?? null);
    const companyId = await resolveActiveCompanyId(token ?? null, user.id);

    const name = (input.name ?? "").trim();
    if (!name) throw new Error("El nombre del proyecto es obligatorio.");

    let existing: any = null;
    if (input.id != null) {
      const existingRows = await sql`
        SELECT * FROM work_projects
        WHERE id = ${input.id} AND company_id = ${companyId}
      `;
      if (existingRows.length === 0) throw new Error("Proyecto no encontrado.");
      existing = existingRows[0];
    }

    const startDate = input.start_date !== undefined ? (input.start_date ?? null) : (existing?.start_date ? toIso(existing.start_date) : null);
    const targetDate = input.target_date !== undefined ? (input.target_date ?? null) : (existing?.target_date ? toIso(existing.target_date) : null);

    if (startDate && targetDate) {
      const startMs = new Date(startDate).getTime();
      const targetMs = new Date(targetDate).getTime();
      if (targetMs < startMs) {
        throw new Error("La fecha de fin no puede ser anterior a la fecha de inicio.");
      }
    }

    const status = input.status ?? existing?.status ?? "planned";
    const description = input.description !== undefined ? (input.description ?? "") : (existing?.description ?? "");

    let projectId: number;
    if (existing) {
      const updated = await sql`
        UPDATE work_projects SET
          name = ${name},
          description = ${description},
          status = ${status},
          start_date = ${startDate},
          target_date = ${targetDate},
          updated_at = NOW()
        WHERE id = ${existing.id} AND company_id = ${companyId}
        RETURNING id
      `;
      projectId = updated[0].id;
    } else {
      const inserted = await sql`
        INSERT INTO work_projects (
          company_id, name, description, status, start_date, target_date, created_by
        ) VALUES (
          ${companyId}, ${name}, ${description}, ${status}, ${startDate}, ${targetDate}, ${user.id}
        )
        RETURNING id
      `;
      projectId = inserted[0].id;
    }

    const fetched = await sql`
      SELECT * FROM work_projects WHERE id = ${projectId} AND company_id = ${companyId}
    `;
    return formatWorkProject(fetched[0]);
  },

  async archiveWorkProject(id: number, token?: string | null): Promise<WorkProject> {
    const user = await requireAdminProjectManagementPg(token ?? null);
    const companyId = await resolveActiveCompanyId(token ?? null, user.id);

    const res = await sql`
      UPDATE work_projects
      SET status = 'archived', updated_at = NOW()
      WHERE id = ${id} AND company_id = ${companyId}
      RETURNING id
    `;
    if (res.length === 0) throw new Error("Proyecto no encontrado.");

    const fetched = await sql`
      SELECT * FROM work_projects WHERE id = ${id} AND company_id = ${companyId}
    `;
    return formatWorkProject(fetched[0]);
  },
  async listWorkItems(filters?: WorkItemFilters, token?: string | null): Promise<WorkItem[]> {
    const user = await requireSession(token ?? null);
    const companyId = await resolveActiveCompanyId(token ?? null, user.id);

    let query = sql`
      SELECT
        wi.*,
        wc.name AS category_name,
        wc.normalized_name AS category_normalized_name,
        wc.color AS category_color,
        wc.archived_at AS category_archived_at,
        wc.created_at AS category_created_at,
        wc.updated_at AS category_updated_at,
        u.display_name AS assignee_name
      FROM work_items wi
      LEFT JOIN work_categories wc ON wi.category_id = wc.id
      LEFT JOIN users u ON wi.assignee_id = u.id
      WHERE wi.company_id = ${companyId}
    `;

    if (filters) {
      if (filters.status) query = sql`${query} AND wi.status = ${filters.status}`;
      if (filters.type) query = sql`${query} AND wi.type = ${filters.type}`;
      if (filters.priority) query = sql`${query} AND wi.priority = ${filters.priority}`;
      if (filters.category_id !== undefined) {
        if (filters.category_id === null) {
          query = sql`${query} AND wi.category_id IS NULL`;
        } else {
          query = sql`${query} AND wi.category_id = ${filters.category_id}`;
        }
      }
      if (filters.project_id !== undefined) {
        if (filters.project_id === null) {
          query = sql`${query} AND wi.project_id IS NULL`;
        } else if (typeof filters.project_id === "number") {
          query = sql`${query} AND wi.project_id = ${filters.project_id}`;
        }
      }
      if (filters.assignee_id !== undefined) {
        if (filters.assignee_id === null) {
          query = sql`${query} AND wi.assignee_id IS NULL`;
        } else {
          query = sql`${query} AND wi.assignee_id = ${filters.assignee_id}`;
        }
      }
      if (filters.text && filters.text.trim()) {
        const pattern = `%${filters.text.trim()}%`;
        query = sql`${query} AND (wi.title ILIKE ${pattern} OR wi.description ILIKE ${pattern})`;
      }
    }

    query = sql`${query} ORDER BY wi.sort_order ASC, wi.created_at DESC`;
    const rows = await query;
    return rows.map(formatWorkItem);
  },

  async upsertWorkItem(input: WorkItemInput, token?: string | null): Promise<WorkItem> {
    const user = await requireSession(token ?? null);
    const companyId = await resolveActiveCompanyId(token ?? null, user.id);

    const title = (input.title ?? "").trim();
    if (!title) throw new Error("El título es obligatorio.");
    const truncatedTitle = title.slice(0, 255);

    if (input.assignee_id != null) {
      const members = await this.listWorkMembers(token);
      if (!members.some((m) => m.id === input.assignee_id)) {
        throw new Error("El responsable no pertenece a esta empresa.");
      }
    }

    let categoryId = input.category_id ?? null;
    if (input.category_name && input.category_name.trim() !== "") {
      const catName = input.category_name.trim();
      const normName = catName.toUpperCase();
      const catRows = await sql`
        SELECT id FROM work_categories
        WHERE company_id = ${companyId} AND normalized_name = ${normName}
        LIMIT 1
      `;
      if (catRows.length > 0) {
        categoryId = catRows[0].id;
      } else {
        const newCat = await sql`
          INSERT INTO work_categories (company_id, name, normalized_name, color)
          VALUES (${companyId}, ${catName}, ${normName}, '#6b7280')
          RETURNING id
        `;
        categoryId = newCat[0].id;
      }
    }

    if (categoryId != null) {
      const catCheck = await sql`SELECT id FROM work_categories WHERE id = ${categoryId} AND company_id = ${companyId}`;
      if (catCheck.length === 0) throw new Error("La categoría no pertenece a esta empresa.");
    }

    if (input.project_id != null) {
      const projCheck = await sql`SELECT id, status FROM work_projects WHERE id = ${input.project_id} AND company_id = ${companyId}`;
      if (projCheck.length === 0) throw new Error("El proyecto no pertenece a esta empresa.");
      if (projCheck[0].status === "archived") throw new Error("No se pueden crear ni asignar tareas a un proyecto archivado.");
    }

    let existing: any = null;
    if (input.id != null) {
      const existingRows = await sql`SELECT * FROM work_items WHERE id = ${input.id} AND company_id = ${companyId}`;
      if (existingRows.length === 0) throw new Error("Tarea no encontrada.");
      existing = existingRows[0];
    }

    const targetStatus = input.status ?? existing?.status ?? "inbox";
    const sourceType = input.source_type !== undefined ? input.source_type : (existing?.source_type ?? null);
    const sourceKey = input.source_key !== undefined ? input.source_key : (existing?.source_key ?? null);
    const isActive = targetStatus !== "done" && targetStatus !== "archived";

    if (sourceType && sourceKey && isActive) {
      const dupQuery = input.id != null
        ? sql`SELECT id FROM work_items WHERE company_id = ${companyId} AND source_type = ${sourceType} AND source_key = ${sourceKey} AND status NOT IN ('done', 'archived') AND id <> ${input.id} LIMIT 1`
        : sql`SELECT id FROM work_items WHERE company_id = ${companyId} AND source_type = ${sourceType} AND source_key = ${sourceKey} AND status NOT IN ('done', 'archived') LIMIT 1`;
      const activeDup = await dupQuery;
      if (activeDup.length > 0) {
        throw new Error("Ya existe una tarea activa para este origen.");
      }
    }

    let completedAt: Date | null = null;
    if (targetStatus === "done") {
      completedAt = existing && existing.status === "done" && existing.completed_at ? existing.completed_at : new Date();
    } else {
      completedAt = null;
    }

    let itemId: number;
    if (existing) {
      const updated = await sql`
        UPDATE work_items SET
          category_id = ${categoryId},
          project_id = ${input.project_id !== undefined ? input.project_id : existing.project_id},
          assignee_id = ${input.assignee_id !== undefined ? input.assignee_id : existing.assignee_id},
          title = ${truncatedTitle},
          description = ${input.description !== undefined ? input.description : existing.description},
          type = ${input.type ?? existing.type},
          status = ${targetStatus},
          priority = ${input.priority ?? existing.priority},
          start_date = ${input.start_date !== undefined ? (input.start_date ?? null) : (existing.start_date ?? null)},
          due_date = ${input.due_date !== undefined ? (input.due_date ?? null) : (existing.due_date ?? null)},
          sort_order = ${input.sort_order ?? existing.sort_order ?? 0},
          source_type = ${sourceType ?? null},
          source_key = ${sourceKey ?? null},
          source_href = ${input.source_href !== undefined ? (input.source_href ?? null) : (existing.source_href ?? null)},
          completed_at = ${completedAt ?? null},
          updated_at = NOW()
        WHERE id = ${input.id ?? null} AND company_id = ${companyId}
        RETURNING id
      `;
      itemId = updated[0].id;
    } else {
      const inserted = await sql`
        INSERT INTO work_items (
          company_id, category_id, project_id, assignee_id, created_by, title, description,
          type, status, priority, start_date, due_date, sort_order, source_type, source_key,
          source_href, completed_at
        ) VALUES (
          ${companyId}, ${categoryId}, ${input.project_id ?? null}, ${input.assignee_id ?? null},
          ${user.id}, ${truncatedTitle}, ${input.description ?? ""}, ${input.type ?? "task"},
          ${targetStatus}, ${input.priority ?? "normal"}, ${input.start_date ?? null}, ${input.due_date ?? null},
          ${input.sort_order ?? 0}, ${sourceType}, ${sourceKey}, ${input.source_href ?? null}, ${completedAt}
        )
        RETURNING id
      `;
      itemId = inserted[0].id;
    }

    const fetched = await sql`
      SELECT
        wi.*,
        wc.name AS category_name,
        wc.normalized_name AS category_normalized_name,
        wc.color AS category_color,
        wc.archived_at AS category_archived_at,
        wc.created_at AS category_created_at,
        wc.updated_at AS category_updated_at,
        u.display_name AS assignee_name
      FROM work_items wi
      LEFT JOIN work_categories wc ON wi.category_id = wc.id
      LEFT JOIN users u ON wi.assignee_id = u.id
      WHERE wi.id = ${itemId} AND wi.company_id = ${companyId}
    `;
    return formatWorkItem(fetched[0]);
  },

  async archiveWorkItem(id: number, token?: string | null): Promise<WorkItem> {
    const user = await requireSession(token ?? null);
    const companyId = await resolveActiveCompanyId(token ?? null, user.id);
    const res = await sql`
      UPDATE work_items
      SET status = 'archived', completed_at = NULL, updated_at = NOW()
      WHERE id = ${id} AND company_id = ${companyId}
      RETURNING id
    `;
    if (res.length === 0) throw new Error("Tarea no encontrada.");

    const fetched = await sql`
      SELECT
        wi.*,
        wc.name AS category_name,
        wc.normalized_name AS category_normalized_name,
        wc.color AS category_color,
        wc.archived_at AS category_archived_at,
        wc.created_at AS category_created_at,
        wc.updated_at AS category_updated_at,
        u.display_name AS assignee_name
      FROM work_items wi
      LEFT JOIN work_categories wc ON wi.category_id = wc.id
      LEFT JOIN users u ON wi.assignee_id = u.id
      WHERE wi.id = ${id} AND wi.company_id = ${companyId}
    `;
    return formatWorkItem(fetched[0]);
  },

  async listWorkCategories(token?: string | null): Promise<WorkCategory[]> {
    const user = await requireSession(token ?? null);
    const companyId = await resolveActiveCompanyId(token ?? null, user.id);
    const rows = await sql`
      SELECT * FROM work_categories
      WHERE company_id = ${companyId} AND archived_at IS NULL
      ORDER BY name ASC
    `;
    return rows.map((r) => ({
      id: r.id,
      company_id: r.company_id,
      name: r.name,
      normalized_name: r.normalized_name,
      color: r.color,
      archived_at: toIso(r.archived_at) || null,
      created_at: toIso(r.created_at),
      updated_at: toIso(r.updated_at),
    }));
  },

  async renameWorkCategory(id: number, name: string, token?: string | null): Promise<WorkCategory> {
    await requireAdminCategoryManagementPg(token ?? null);
    const user = await requireSession(token ?? null);
    const companyId = await resolveActiveCompanyId(token ?? null, user.id);

    const trimmed = (name ?? "").trim();
    if (!trimmed) throw new Error("El nombre de la categoría es obligatorio.");
    const normName = trimmed.toUpperCase();

    const dup = await sql`
      SELECT id FROM work_categories
      WHERE company_id = ${companyId} AND normalized_name = ${normName} AND id <> ${id}
    `;
    if (dup.length > 0) throw new Error("Ya existe una categoría con ese nombre.");

    const updated = await sql`
      UPDATE work_categories
      SET name = ${trimmed}, normalized_name = ${normName}, updated_at = NOW()
      WHERE id = ${id} AND company_id = ${companyId}
      RETURNING *
    `;
    if (updated.length === 0) throw new Error("Categoría no encontrada.");

    const r = updated[0];
    return {
      id: r.id,
      company_id: r.company_id,
      name: r.name,
      normalized_name: r.normalized_name,
      color: r.color,
      archived_at: toIso(r.archived_at) || null,
      created_at: toIso(r.created_at),
      updated_at: toIso(r.updated_at),
    };
  },

  async mergeWorkCategory(sourceId: number, targetId: number, token?: string | null): Promise<WorkCategory> {
    await requireAdminCategoryManagementPg(token ?? null);
    if (sourceId === targetId) {
      throw new Error("La categoría de origen y destino no pueden ser la misma.");
    }
    const user = await requireSession(token ?? null);
    const companyId = await resolveActiveCompanyId(token ?? null, user.id);

    const check = await sql`
      SELECT id FROM work_categories
      WHERE id IN (${sourceId}, ${targetId}) AND company_id = ${companyId}
    `;
    if (check.length < 2) throw new Error("Categoría no encontrada.");

    await sql`
      UPDATE work_items
      SET category_id = ${targetId}, updated_at = NOW()
      WHERE company_id = ${companyId} AND category_id = ${sourceId}
    `;
    await sql`
      UPDATE work_categories
      SET archived_at = NOW(), updated_at = NOW()
      WHERE id = ${sourceId} AND company_id = ${companyId}
    `;

    const target = await sql`
      SELECT * FROM work_categories WHERE id = ${targetId} AND company_id = ${companyId}
    `;
    const r = target[0];
    return {
      id: r.id,
      company_id: r.company_id,
      name: r.name,
      normalized_name: r.normalized_name,
      color: r.color,
      archived_at: toIso(r.archived_at) || null,
      created_at: toIso(r.created_at),
      updated_at: toIso(r.updated_at),
    };
  },

  async archiveWorkCategory(id: number, token?: string | null): Promise<WorkCategory> {
    await requireAdminCategoryManagementPg(token ?? null);
    const user = await requireSession(token ?? null);
    const companyId = await resolveActiveCompanyId(token ?? null, user.id);

    const res = await sql`
      UPDATE work_categories
      SET archived_at = NOW(), updated_at = NOW()
      WHERE id = ${id} AND company_id = ${companyId}
      RETURNING *
    `;
    if (res.length === 0) throw new Error("Categoría no encontrada.");

    const r = res[0];
    return {
      id: r.id,
      company_id: r.company_id,
      name: r.name,
      normalized_name: r.normalized_name,
      color: r.color,
      archived_at: toIso(r.archived_at) || null,
      created_at: toIso(r.created_at),
      updated_at: toIso(r.updated_at),
    };
  },

  async listWorkMembers(token?: string | null): Promise<WorkMember[]> {
    const user = await requireSession(token ?? null);
    const companyId = await resolveActiveCompanyId(token ?? null, user.id);
    const rows = await sql`
      SELECT u.id, u.display_name, cm.role
      FROM company_members cm
      JOIN users u ON cm.user_id = u.id
      WHERE cm.company_id = ${companyId} AND u.active = TRUE
      ORDER BY u.id ASC
    `;
    return rows.map((r) => ({
      id: r.id,
      display_name: r.display_name,
      role: r.role,
    }));
  },

  async captureDashboardAlert(input: any, token?: string | null): Promise<WorkItem> {
    const user = await requireSession(token ?? null);
    const companyId = await resolveActiveCompanyId(token ?? null, user.id);

    const alertId = String(input?.alertId || input?.alert_id || input?.id || "");
    if (!alertId) throw new Error("ID de alerta obligatorio.");

    const existing = await sql`
      SELECT id FROM work_items
      WHERE company_id = ${companyId}
        AND source_type = 'dashboard_alert'
        AND source_key = ${alertId}
        AND status NOT IN ('done', 'archived')
      LIMIT 1
    `;
    if (existing.length > 0) {
      const fetched = await sql`
        SELECT
          wi.*,
          wc.name AS category_name,
          wc.normalized_name AS category_normalized_name,
          wc.color AS category_color,
          wc.archived_at AS category_archived_at,
          wc.created_at AS category_created_at,
          wc.updated_at AS category_updated_at,
          u.display_name AS assignee_name
        FROM work_items wi
        LEFT JOIN work_categories wc ON wi.category_id = wc.id
        LEFT JOIN users u ON wi.assignee_id = u.id
        WHERE wi.id = ${existing[0].id} AND wi.company_id = ${companyId}
      `;
      return formatWorkItem(fetched[0]);
    }

    let catName = "General";
    if (alertId === "stock") catName = "Inventario";
    else if (alertId === "backup") catName = "Administración";
    else if (alertId === "no-sales" || alertId === "sales-down") catName = "Ventas";

    const title = input?.title || `Alerta: ${alertId}`;
    const description = input?.detail || input?.description || "";
    const source_href = input?.href || input?.source_href || null;

    return this.upsertWorkItem(
      {
        title,
        description,
        type: "task",
        status: "inbox",
        priority: "high",
        category_name: catName,
        source_type: "dashboard_alert",
        source_key: alertId,
        source_href,
      },
      token
    );
  },

  async upsertWorkCategory(input: { id?: number | null; name: string; color?: string }, token?: string | null): Promise<WorkCategory> {
    await requireAdminCategoryManagementPg(token ?? null);
    const user = await requireSession(token ?? null);
    const companyId = await resolveActiveCompanyId(token ?? null, user.id);

    const trimmed = (input.name ?? "").trim();
    if (!trimmed) throw new Error("El nombre de la categoría es obligatorio.");
    const normName = trimmed.toUpperCase();

    if (input.id) {
      const dup = await sql`
        SELECT id FROM work_categories
        WHERE company_id = ${companyId} AND normalized_name = ${normName} AND id <> ${input.id}
      `;
      if (dup.length > 0) throw new Error("Ya existe una categoría con ese nombre.");

      const updated = await sql`
        UPDATE work_categories
        SET name = ${trimmed}, normalized_name = ${normName}, color = ${input.color || '#3b82f6'}, updated_at = NOW()
        WHERE id = ${input.id} AND company_id = ${companyId}
        RETURNING *
      `;
      if (updated.length === 0) throw new Error("Categoría no encontrada.");
      const r = updated[0];
      return {
        id: r.id,
        company_id: r.company_id,
        name: r.name,
        normalized_name: r.normalized_name,
        color: r.color,
        archived_at: toIso(r.archived_at) || null,
        created_at: toIso(r.created_at),
        updated_at: toIso(r.updated_at),
      };
    }

    const dup = await sql`
      SELECT id FROM work_categories
      WHERE company_id = ${companyId} AND normalized_name = ${normName} AND archived_at IS NULL
    `;
    if (dup.length > 0) throw new Error("Ya existe una categoría con ese nombre.");

    const inserted = await sql`
      INSERT INTO work_categories (company_id, name, normalized_name, color)
      VALUES (${companyId}, ${trimmed}, ${normName}, ${input.color || '#3b82f6'})
      RETURNING *
    `;
    const r = inserted[0];
    return {
      id: r.id,
      company_id: r.company_id,
      name: r.name,
      normalized_name: r.normalized_name,
      color: r.color,
      archived_at: toIso(r.archived_at) || null,
      created_at: toIso(r.created_at),
      updated_at: toIso(r.updated_at),
    };
  },

  list_work_projects(status_filter?: string, token?: string | null) { return this.listWorkProjects(status_filter, token); },
  get_work_project(id: number, token?: string | null) { return this.getWorkProject(id, token); },
  upsert_work_project(input: WorkProjectInput, token?: string | null) { return this.upsertWorkProject(input, token); },
  archive_work_project(id: number, token?: string | null) { return this.archiveWorkProject(id, token); },
  list_work_categories(token?: string | null) { return this.listWorkCategories(token); },
  upsert_work_category(input: any, token?: string | null) { return this.upsertWorkCategory(input, token); },
  merge_work_categories(sourceId: number, targetId: number, token?: string | null) { return this.mergeWorkCategory(sourceId, targetId, token); },
  archive_work_category(id: number, token?: string | null) { return this.archiveWorkCategory(id, token); },
  list_work_members(token?: string | null) { return this.listWorkMembers(token); },
  list_work_items(filters?: WorkItemFilters, token?: string | null) { return this.listWorkItems(filters, token); },
  upsert_work_item(input: WorkItemInput, token?: string | null) { return this.upsertWorkItem(input, token); },
  archive_work_item(id: number, token?: string | null) { return this.archiveWorkItem(id, token); },
  capture_dashboard_alert(input: any, token?: string | null) { return this.captureDashboardAlert(input, token); },

  async list_warehouses(token?: string | null): Promise<Warehouse[]> {
    const user = await requireSession(token ?? null);
    if (!token) throw new Error("Sesión no iniciada");
    const cid = await resolveActiveCompanyId(token, user.id);
    const rows = await sql`
      SELECT * FROM warehouses
      WHERE company_id = ${cid}
      ORDER BY is_default DESC, name ASC
    `;
    return rows.map((r) => ({
      id: r.id,
      company_id: r.company_id,
      code: r.code,
      name: r.name,
      is_default: !!r.is_default,
      active: !!r.active,
      created_at: toIso(r.created_at),
      updated_at: toIso(r.updated_at),
    }));
  },

  async list_stock_locations(warehouse_id?: number | null, token?: string | null): Promise<StockLocation[]> {
    const user = await requireSession(token ?? null);
    if (!token) throw new Error("Sesión no iniciada");
    const cid = await resolveActiveCompanyId(token, user.id);
    const rows = warehouse_id
      ? await sql`
          SELECT * FROM stock_locations
          WHERE company_id = ${cid} AND warehouse_id = ${warehouse_id}
          ORDER BY is_default DESC, name ASC
        `
      : await sql`
          SELECT * FROM stock_locations
          WHERE company_id = ${cid}
          ORDER BY is_default DESC, name ASC
        `;
    return rows.map((r) => ({
      id: r.id,
      company_id: r.company_id,
      warehouse_id: r.warehouse_id,
      code: r.code,
      name: r.name,
      location_type: r.location_type || "warehouse",
      allow_negative_stock: !!r.allow_negative_stock,
      active: !!r.active,
      created_at: toIso(r.created_at),
      updated_at: toIso(r.updated_at),
    }));
  },

  async list_stock_balances(
    filters?: { product_id?: number; location_id?: number } | null,
    token?: string | null,
  ): Promise<StockBalance[]> {
    const user = await requireSession(token ?? null);
    if (!token) throw new Error("Sesión no iniciada");
    const cid = await resolveActiveCompanyId(token, user.id);

    const productId = filters?.product_id ? Number(filters.product_id) : null;
    const locationId = filters?.location_id ? Number(filters.location_id) : null;

    const rows = await sql`
      SELECT sb.*, sl.name as location_name, sl.warehouse_id
      FROM stock_balances sb
      LEFT JOIN stock_locations sl ON sb.location_id = sl.id
      WHERE sb.company_id = ${cid}
        ${productId ? sql`AND sb.product_id = ${productId}` : sql``}
        ${locationId ? sql`AND sb.location_id = ${locationId}` : sql``}
      ORDER BY sb.product_id ASC, sb.location_id ASC
    `;

    return rows.map((r) => ({
      company_id: r.company_id,
      product_id: r.product_id,
      location_id: r.location_id,
      location_name: r.location_name || "",
      warehouse_id: r.warehouse_id,
      on_hand: r.on_hand ?? 0,
      reserved: r.reserved ?? 0,
      blocked: r.blocked ?? 0,
      incoming: r.incoming ?? 0,
      available: r.available ?? (r.on_hand ?? 0) - (r.reserved ?? 0) - (r.blocked ?? 0),
      updated_at: toIso(r.updated_at),
    }));
  },

  async list_inventory_movements(
    filters?: { product_id?: number; location_id?: number; limit?: number } | null,
    token?: string | null,
  ): Promise<InventoryMovement[]> {
    const user = await requireSession(token ?? null);
    if (!token) throw new Error("Sesión no iniciada");
    const cid = await resolveActiveCompanyId(token, user.id);

    const productId = filters?.product_id ? Number(filters.product_id) : null;
    const locationId = filters?.location_id ? Number(filters.location_id) : null;
    const limitVal = filters?.limit && filters.limit > 0 ? Number(filters.limit) : 200;

    const rows = await sql`
      SELECT im.*,
        p.sku as product_sku,
        p.name as product_name,
        fl.name as from_location_name,
        tl.name as to_location_name,
        u.display_name as created_by_name
      FROM inventory_movements im
      LEFT JOIN products p ON im.product_id = p.id
      LEFT JOIN stock_locations fl ON im.from_location_id = fl.id
      LEFT JOIN stock_locations tl ON im.to_location_id = tl.id
      LEFT JOIN users u ON im.actor_id = u.id
      WHERE im.company_id = ${cid}
        ${productId ? sql`AND im.product_id = ${productId}` : sql``}
        ${locationId ? sql`AND (im.from_location_id = ${locationId} OR im.to_location_id = ${locationId})` : sql``}
      ORDER BY im.created_at DESC, im.id DESC
      LIMIT ${limitVal}
    `;

    return rows.map((r) => ({
      id: r.id,
      company_id: r.company_id,
      product_id: r.product_id,
      product_sku: r.product_sku || "",
      product_name: r.product_name || "",
      movement_type: r.movement_type,
      reason: r.reason_code || "",
      quantity: r.qty ?? 0,
      from_location_id: r.from_location_id,
      to_location_id: r.to_location_id,
      from_location_name: r.from_location_name || null,
      to_location_name: r.to_location_name || null,
      unit_cost_cents: r.cost_cents ?? 0,
      reference_type: r.ref_type || null,
      reference_id: r.ref_id,
      reversed_movement_id: r.reversed_movement_id,
      is_reversal: !!r.is_reversal,
      notes: r.notes || null,
      created_by: r.actor_id,
      created_by_name: r.created_by_name || null,
      created_at: toIso(r.created_at),
    }));
  },

  async create_inventory_movement(input: CreateInventoryMovementInput | any, token?: string | null): Promise<InventoryMovement> {
    const user = await requireSession(token ?? null);
    if (!token) throw new Error("Sesión no iniciada");
    const cid = input.company_id ? Number(input.company_id) : await resolveActiveCompanyId(token, user.id);

    const productId = Number(input.product_id);
    if (!productId) throw new Error("product_id es requerido");

    const qty = Number(input.quantity ?? input.qty);
    if (!qty || qty <= 0 || !Number.isFinite(qty)) {
      throw new Error("La cantidad debe ser un número entero mayor que 0");
    }

    const movementType = String(input.movement_type);
    const idempotencyKey = input.idempotency_key ? String(input.idempotency_key) : null;

    return await sql.begin(async (tx) => {
      if (idempotencyKey) {
        const existing = await tx`
          SELECT im.*,
            p.sku as product_sku, p.name as product_name,
            fl.name as from_location_name, tl.name as to_location_name,
            u.display_name as created_by_name
          FROM inventory_movements im
          LEFT JOIN products p ON im.product_id = p.id
          LEFT JOIN stock_locations fl ON im.from_location_id = fl.id
          LEFT JOIN stock_locations tl ON im.to_location_id = tl.id
          LEFT JOIN users u ON im.actor_id = u.id
          WHERE im.company_id = ${cid} AND im.idempotency_key = ${idempotencyKey}
        `;
        if (existing.length > 0) {
          const r = existing[0];
          return {
            id: r.id,
            company_id: r.company_id,
            product_id: r.product_id,
            product_sku: r.product_sku || "",
            product_name: r.product_name || "",
            movement_type: r.movement_type,
            reason: r.reason_code || "",
            quantity: r.qty ?? 0,
            from_location_id: r.from_location_id,
            to_location_id: r.to_location_id,
            from_location_name: r.from_location_name || null,
            to_location_name: r.to_location_name || null,
            unit_cost_cents: r.cost_cents ?? 0,
            reference_type: r.ref_type || null,
            reference_id: r.ref_id,
            reversed_movement_id: r.reversed_movement_id,
            is_reversal: !!r.is_reversal,
            notes: r.notes || null,
            created_by: r.actor_id,
            created_by_name: r.created_by_name || null,
            created_at: toIso(r.created_at),
          };
        }
      }

      const prodRes = await tx`SELECT id, cost_cents FROM products WHERE id = ${productId} AND company_id = ${cid}`;
      if (prodRes.length === 0) throw new Error("Producto no encontrado en la empresa");

      let fromLocationId = input.from_location_id ? Number(input.from_location_id) : null;
      let toLocationId = input.to_location_id ? Number(input.to_location_id) : null;

      if (movementType === "in" || movementType === "initial_stock") {
        if (!toLocationId) {
          const defaultLoc = await tx`SELECT id FROM stock_locations WHERE company_id = ${cid} AND is_default = TRUE LIMIT 1`;
          toLocationId = defaultLoc[0]?.id ?? null;
        }
      } else if (movementType === "out") {
        if (!fromLocationId) {
          const defaultLoc = await tx`SELECT id FROM stock_locations WHERE company_id = ${cid} AND is_default = TRUE LIMIT 1`;
          fromLocationId = defaultLoc[0]?.id ?? null;
        }
      }

      const reasonCode = String(input.reason ?? input.reason_code ?? "other");
      const costCents = input.unit_cost_cents != null ? Number(input.unit_cost_cents) : (input.cost_cents != null ? Number(input.cost_cents) : prodRes[0].cost_cents ?? 0);
      const notes = input.notes ? String(input.notes) : "";
      const refType = input.reference_type ?? input.ref_type ?? "";
      const refId = input.reference_id ?? input.ref_id ?? null;
      const isReversal = !!input.is_reversal;
      const reversedMovementId = input.reversed_movement_id ? Number(input.reversed_movement_id) : null;

      const insertedMovements = await tx`
        INSERT INTO inventory_movements (
          company_id, product_id, from_location_id, to_location_id, movement_type, qty, cost_cents,
          effective_at, created_at, actor_id, reason_code, notes, ref_type, ref_id, idempotency_key,
          reversed_movement_id, is_reversal
        ) VALUES (
          ${cid}, ${productId}, ${fromLocationId}, ${toLocationId}, ${movementType}, ${qty}, ${costCents},
          NOW(), NOW(), ${user.id}, ${reasonCode}, ${notes}, ${refType}, ${refId ? Number(refId) : null}, ${idempotencyKey},
          ${reversedMovementId}, ${isReversal}
        )
        RETURNING *
      `;
      const mov = insertedMovements[0];

      if (fromLocationId) {
        await tx`
          INSERT INTO stock_balances (company_id, product_id, location_id, on_hand, reserved, blocked, incoming, available, updated_at)
          VALUES (${cid}, ${productId}, ${fromLocationId}, 0, 0, 0, 0, 0, NOW())
          ON CONFLICT (company_id, product_id, location_id) DO NOTHING
        `;
        const updateFrom = await tx`
          UPDATE stock_balances
          SET on_hand = on_hand - ${qty}, available = available - ${qty}, updated_at = NOW()
          WHERE company_id = ${cid} AND product_id = ${productId} AND location_id = ${fromLocationId}
          RETURNING *
        `;
        const bal = updateFrom[0];

        const locRes = await tx`SELECT allow_negative_stock FROM stock_locations WHERE id = ${fromLocationId}`;
        const allowNeg = input.allow_negative_stock === true || !!locRes[0]?.allow_negative_stock;
        if (!allowNeg && (bal?.available < 0 || bal?.on_hand < 0)) {
          throw new Error(`Stock insuficiente en ubicación origen (disponible: ${bal?.available ?? 0})`);
        }
      }

      if (toLocationId) {
        await tx`
          INSERT INTO stock_balances (company_id, product_id, location_id, on_hand, reserved, blocked, incoming, available, updated_at)
          VALUES (${cid}, ${productId}, ${toLocationId}, ${qty}, 0, 0, 0, ${qty}, NOW())
          ON CONFLICT (company_id, product_id, location_id)
          DO UPDATE SET
            on_hand = stock_balances.on_hand + ${qty},
            available = stock_balances.available + ${qty},
            updated_at = NOW()
          RETURNING *
        `;
      }

      await tx`
        UPDATE products
        SET stock = COALESCE((
          SELECT SUM(on_hand)::int FROM stock_balances WHERE company_id = ${cid} AND product_id = ${productId}
        ), 0),
        updated_at = NOW()
        WHERE id = ${productId} AND company_id = ${cid}
      `;

      const [fromLoc, toLoc, prodInfo] = await Promise.all([
        fromLocationId ? tx`SELECT name FROM stock_locations WHERE id = ${fromLocationId}` : Promise.resolve([]),
        toLocationId ? tx`SELECT name FROM stock_locations WHERE id = ${toLocationId}` : Promise.resolve([]),
        tx`SELECT sku, name FROM products WHERE id = ${productId}`,
      ]);

      return {
        id: mov.id,
        company_id: mov.company_id,
        product_id: mov.product_id,
        product_sku: prodInfo[0]?.sku || "",
        product_name: prodInfo[0]?.name || "",
        movement_type: mov.movement_type,
        reason: mov.reason_code || "",
        quantity: mov.qty ?? 0,
        from_location_id: mov.from_location_id,
        to_location_id: mov.to_location_id,
        from_location_name: fromLoc[0]?.name || null,
        to_location_name: toLoc[0]?.name || null,
        unit_cost_cents: mov.cost_cents ?? 0,
        reference_type: mov.ref_type || null,
        reference_id: mov.ref_id,
        reversed_movement_id: mov.reversed_movement_id,
        is_reversal: !!mov.is_reversal,
        notes: mov.notes || null,
        created_by: mov.actor_id,
        created_by_name: user.display_name,
        created_at: toIso(mov.created_at),
      };
    });
  },

  async reverse_inventory_movement(
    movement_id: number,
    reason?: string,
    token?: string | null,
  ): Promise<InventoryMovement> {
    const user = await requireSession(token ?? null);
    if (!token) throw new Error("Sesión no iniciada");
    const cid = await resolveActiveCompanyId(token, user.id);

    const origRes = await sql`
      SELECT * FROM inventory_movements WHERE id = ${movement_id} AND company_id = ${cid}
    `;
    if (origRes.length === 0) throw new Error("Movimiento de inventario no encontrado");
    const orig = origRes[0];

    if (orig.is_reversal) {
      throw new Error("No se puede anular una reversión de movimiento");
    }

    const existingReversal = await sql`
      SELECT id FROM inventory_movements WHERE company_id = ${cid} AND reversed_movement_id = ${movement_id}
    `;
    if (existingReversal.length > 0) {
      const revMovements = await this.list_inventory_movements({ product_id: orig.product_id, limit: 100 }, token);
      const found = revMovements.find((m) => m.id === existingReversal[0].id);
      if (found) return found;
    }

    const compensatoryFrom = orig.to_location_id;
    const compensatoryTo = orig.from_location_id;

    let compType: string = "reversal";
    if (orig.movement_type === "in") compType = "out";
    else if (orig.movement_type === "out") compType = "in";
    else if (orig.movement_type === "transfer") compType = "transfer";

    const reversalInput = {
      company_id: cid,
      product_id: orig.product_id,
      movement_type: compType,
      quantity: orig.qty,
      from_location_id: compensatoryFrom,
      to_location_id: compensatoryTo,
      unit_cost_cents: orig.cost_cents,
      reason: reason || "movement_reversal",
      notes: `Reversión de movimiento #${orig.id}${orig.notes ? ` (${orig.notes})` : ""}`,
      reference_type: orig.ref_type,
      reference_id: orig.ref_id,
      idempotency_key: `reversal_${orig.id}`,
      reversed_movement_id: orig.id,
      is_reversal: true,
    };

    return await this.create_inventory_movement(reversalInput, token);
  },

  listWarehouses(token?: string | null) { return this.list_warehouses(token); },
  listStockLocations(warehouse_id?: number | null, token?: string | null) { return this.list_stock_locations(warehouse_id, token); },
  listStockBalances(filters?: { product_id?: number; location_id?: number } | null, token?: string | null) { return this.list_stock_balances(filters, token); },
  listInventoryMovements(filters?: { product_id?: number; location_id?: number; limit?: number } | null, token?: string | null) { return this.list_inventory_movements(filters, token); },
  createInventoryMovement(input: any, token?: string | null) { return this.create_inventory_movement(input, token); },
  reverseInventoryMovement(movement_id: number, reason?: string, token?: string | null) { return this.reverse_inventory_movement(movement_id, reason, token); },
};

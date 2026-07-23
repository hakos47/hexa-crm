import type { VatRate } from "./vat";

/** app roles */
export type UserRole = "admin" | "cajero";

/** Multi-empresa: kind de negocio (docs/MULTI_COMPANY_ANALYSIS.md) */
export type CompanyKind = "retail_secondhand" | "software_studio" | "generic";

export type Company = {
  id: number;
  code: string;
  legal_name: string;
  trade_name: string;
  nif: string;
  kind: CompanyKind;
  active: boolean;
  created_at: string;
};

export type CompanyMember = {
  company_id: number;
  user_id: number;
  role: UserRole;
};

export type FulfillmentMode = "own_stock" | "supplier_dropship" | "third_party_fulfillment" | "make_to_order";
export type ProductCondition = "new" | "open_box" | "refurbished" | "used" | "preowned" | "for_parts";
export type Supplier = { id: number; company_id?: number; name: string; contact: string; email: string; phone: string; ordering_method: string; notes: string; active: boolean; created_at: string; updated_at: string };
export type SupplierInput = { id?: number | null; name: string; contact?: string; email?: string; phone?: string; ordering_method?: string; notes?: string; active?: boolean };

export type Product = {
  id: number;
  company_id?: number;
  sku: string;
  name: string;
  description: string;
  category: string;
  stock: number;
  min_stock: number;
  cost_cents: number;
  price_cents: number;
  vat_rate: VatRate;
  /** Perfil de abastecimiento P0. Opcional para catálogos creados antes de esta migración. */
  supplier_name?: string;
  supplier_contact?: string;
  supplier_email?: string;
  supplier_phone?: string;
  fulfillment_mode?: FulfillmentMode;
  stock_location?: string;
  condition_code?: ProductCondition;
  active: boolean;
  created_at: string;
  updated_at: string;
};

export type ProductInput = {
  id?: number | null;
  sku: string;
  name: string;
  description?: string;
  category?: string;
  stock?: number;
  min_stock?: number;
  cost_cents: number;
  price_cents: number;
  vat_rate: VatRate;
  supplier_name?: string;
  supplier_contact?: string;
  supplier_email?: string;
  supplier_phone?: string;
  fulfillment_mode?: FulfillmentMode;
  stock_location?: string;
  condition_code?: ProductCondition;
  active?: boolean;
};

export type Customer = {
  id: number;
  company_id?: number;
  name: string;
  email: string;
  phone: string;
  nif: string;
  notes: string;
  created_at: string;
};

export type CustomerInput = {
  id?: number | null;
  name: string;
  email?: string;
  phone?: string;
  nif?: string;
  notes?: string;
};

export type SaleLineInput = {
  product_id: number;
  qty: number;
  unit_price_cents?: number | null;
  discount_cents?: number;
};

export type SaleLine = {
  id: number;
  sale_id: number;
  product_id: number;
  product_name?: string;
  qty: number;
  /** Units already returned (partial returns, ciclo 8). */
  returned_qty?: number;
  unit_price_cents: number;
  vat_rate: VatRate;
  line_base_cents: number;
  line_vat_cents: number;
  line_total_cents: number;
};

export type Sale = {
  id: number;
  company_id?: number;
  customer_id: number | null;
  customer_name?: string | null;
  number: string;
  sold_at: string;
  subtotal_cents: number;
  vat_cents: number;
  total_cents: number;
  /** Cumulative refund cents from partial/full returns. */
  refunded_cents?: number;
  notes: string;
  /** completed | partially_returned | cancelled */
  status: string;
  lines?: SaleLine[];
};

export type ReturnLineInput = {
  line_id: number;
  qty: number;
};

export type CashKind = "income" | "expense" | "adjustment";

export type CashMovement = {
  id: number;
  company_id?: number;
  kind: CashKind;
  amount_cents: number;
  category: string;
  description: string;
  sale_id: number | null;
  occurred_at: string;
};

export type CashInput = {
  kind: CashKind;
  amount_cents: number;
  category: string;
  description?: string;
  occurred_at?: string | null;
};

export type VatBucket = {
  vat_rate: VatRate;
  base_cents: number;
  vat_cents: number;
  total_cents: number;
};

export type VatSummary = {
  from: string;
  to: string;
  buckets: VatBucket[];
  base_cents: number;
  vat_cents: number;
  total_cents: number;
};

export type DashboardStats = {
  sales_today_cents: number;
  sales_month_cents: number;
  sales_today_count: number;
  sales_month_count: number;
  cash_balance_cents: number;
  low_stock: Product[];
  vat_month_cents: number;
  base_month_cents: number;
};

export type Settings = {
  shop_name: string;
  ollama_model: string;
  ollama_url: string;
  default_vat: VatRate;
  /** Minutes without interaction before locking; 0 disables auto-lock. */
  idle_timeout_minutes: number;
  /** ISO timestamp of the latest locally initiated backup. */
  last_backup_at: string | null;
};

export type PluginKey = "database_bridge" | "stripe_mcp";

export type PluginConfig = {
  display_name?: string;
  database_url_env?: string;
  access_mode?: "read_only" | "read_write";
  mcp_url?: string;
  credential_env?: string;
  environment?: "sandbox" | "live";
  allow_write_tools?: boolean;
  require_approval?: boolean;
};

export type TenantPlugin = {
  plugin_key: PluginKey;
  name: string;
  description: string;
  category: "datos" | "pagos";
  capabilities: string[];
  enabled: boolean;
  config: PluginConfig;
  secret_configured: boolean;
  status: "inactive" | "needs_secret" | "ready" | "error";
  last_error: string | null;
  updated_at: string | null;
};

export type PluginTestResult = {
  ok: boolean;
  message: string;
  details?: Record<string, unknown>;
};

export type PluginToolResult = {
  ok: boolean;
  plugin_key: PluginKey;
  tool_name: string;
  result: unknown;
};

export type AiMessage = {
  role: "user" | "assistant" | "system";
  content: string;
};

export type AiChatResult = {
  reply: string;
  model: string;
  offline?: boolean;
};

export type AuthUser = {
  id: number;
  username: string;
  display_name: string;
  role: UserRole;
  active: boolean;
  created_at: string;
  must_change_password: boolean;
  temp_password_issued_at: string | null;
  /** Puede desplegar y operar todos los tenants, manteniendo una vista de empresas asignadas. */
  is_master?: boolean;
};

export type UserInput = {
  id?: number | null;
  username: string;
  display_name: string;
  role: UserRole;
  /** Optional permanent credential on edit only; create always issues a 14-char temp password. */
  pin?: string | null;
  active?: boolean;
};

export type CreateUserResult = {
  user: AuthUser;
  /** Present only when a new temporary password was generated (create). */
  temporary_password?: string;
};

export type LoginResult = {
  user: AuthUser;
  token: string;
  /** Empresas a las que el usuario tiene acceso (ciclo 7+) */
  companies?: Company[];
  active_company_id?: number | null;
};

/* -------------------------------------------------------------
   Módulo Trabajo (Multiempresa)
   ------------------------------------------------------------- */

export type WorkItemType = "idea" | "task" | "issue" | "milestone";

export type WorkStatus =
  | "inbox"
  | "planned"
  | "in_progress"
  | "blocked"
  | "done"
  | "archived";

export type WorkPriority = "low" | "normal" | "high" | "urgent";

export type WorkCategory = {
  id: number;
  company_id: number;
  name: string;
  normalized_name: string;
  color: string;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
};

export type WorkProject = {
  id: number;
  company_id: number;
  name: string;
  description: string;
  status: "planned" | "active" | "paused" | "done" | "archived";
  start_date: string | null;
  target_date: string | null;
  created_by: number;
  created_at: string;
  updated_at: string;
};

export type WorkItem = {
  id: number;
  company_id: number;
  category_id: number | null;
  project_id: number | null;
  assignee_id: number | null;
  created_by: number;
  title: string;
  description: string;
  type: WorkItemType;
  status: WorkStatus;
  priority: WorkPriority;
  start_date: string | null;
  due_date: string | null;
  sort_order: number;
  source_type: string | null;
  source_key: string | null;
  source_href: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  category?: WorkCategory | null;
  assignee_name?: string | null;
};

export type WorkMember = {
  id: number;
  display_name: string;
  role: "admin" | "cajero";
};

export type WorkItemFilters = {
  text?: string;
  status?: WorkStatus;
  type?: WorkItemType;
  priority?: WorkPriority;
  category_id?: number | null;
  assignee_id?: number | null;
};

export type WorkItemInput = {
  id?: number | null;
  title: string;
  description?: string;
  type?: WorkItemType;
  status?: WorkStatus;
  priority?: WorkPriority;
  category_id?: number | null;
  category_name?: string;
  project_id?: number | null;
  assignee_id?: number | null;
  start_date?: string | null;
  due_date?: string | null;
  sort_order?: number;
  source_type?: string | null;
  source_key?: string | null;
  source_href?: string | null;
};

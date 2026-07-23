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

export type WorkProjectInput = {
  id?: number | null;
  name: string;
  description?: string;
  status?: "planned" | "active" | "paused" | "done" | "archived";
  start_date?: string | null;
  target_date?: string | null;
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
  /**
   * Filter by project ID (tri-state semantics):
   * - undefined: all tasks regardless of project
   * - number: tasks belonging to specific project ID
   * - null: tasks without project (unassigned)
   */
  project_id?: number | null;
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
  /** ID del proyecto al que pertenece la tarea, o null/undefined si no pertenece a ninguno */
  project_id?: number | null;
  assignee_id?: number | null;
  start_date?: string | null;
  due_date?: string | null;
  sort_order?: number;
  source_type?: string | null;
  source_key?: string | null;
  source_href?: string | null;
};

/* -------------------------------------------------------------
   Módulo Inventario / Abastecimiento (Inventory Operations Foundation)
   ------------------------------------------------------------- */

/**
 * Almacén físico o centro logístico (Warehouse)
 */
export type Warehouse = {
  id: number;
  company_id: number;
  code: string;
  name: string;
  address?: string | null;
  is_default?: boolean;
  active: boolean;
  created_at: string;
  updated_at?: string | null;
};

/**
 * Categorías / Tipos de ubicación de stock
 */
export type StockLocationType =
  | "store"
  | "warehouse"
  | "in_transit"
  | "quality_hold"
  | "returns"
  | "third_party"
  | "supplier_virtual"
  | "virtual";

/**
 * Ubicación de stock (StockLocation) dentro de un almacén o empresa
 */
export type StockLocation = {
  id: number;
  company_id: number;
  warehouse_id?: number | null;
  code: string;
  name: string;
  location_type: StockLocationType | string;
  /** Política de stock negativo: true para permitir saldos menores a 0 */
  allow_negative_stock: boolean;
  active: boolean;
  created_at: string;
  updated_at?: string | null;
};

/**
 * Tipo de movimiento de inventario (InventoryMovementType)
 */
export type InventoryMovementType =
  | "in"
  | "out"
  | "transfer"
  | "adjustment"
  | "reversal";

/**
 * Motivo del movimiento de inventario (InventoryReason)
 */
export type InventoryReason =
  | "purchase_receive"
  | "sale_shipment"
  | "sale_return"
  | "transfer"
  | "audit_adjustment"
  | "damage_spoilage"
  | "loss_theft"
  | "initial_stock"
  | "supplier_return"
  | "internal_use"
  | "movement_reversal"
  | "other";

/**
 * Etiquetas legibles en español para UI de motivos de inventario
 */
export const INVENTORY_REASON_LABELS: Record<InventoryReason, string> = {
  purchase_receive: "Recepción de compra / proveedor",
  sale_shipment: "Salida por venta TPV",
  sale_return: "Devolución de cliente",
  transfer: "Traspaso entre ubicaciones",
  audit_adjustment: "Ajuste por inventario / auditoría",
  damage_spoilage: "Mermas / Daño / Caducidad",
  loss_theft: "Pérdida / Extravío / Robo",
  initial_stock: "Carga inicial de stock",
  supplier_return: "Devolución a proveedor",
  internal_use: "Uso interno / Muestra",
  movement_reversal: "Anulación de movimiento",
  other: "Otro motivo"
};

/**
 * Etiquetas legibles en español para UI de tipos de movimiento
 */
export const INVENTORY_MOVEMENT_TYPE_LABELS: Record<InventoryMovementType, string> = {
  in: "Entrada de stock",
  out: "Salida de stock",
  transfer: "Traspaso de stock",
  adjustment: "Ajuste de stock",
  reversal: "Reversión de movimiento"
};

/**
 * Registro de movimiento de inventario auditable (InventoryMovement)
 */
export type InventoryMovement = {
  id: number;
  company_id: number;
  product_id: number;
  product_sku?: string;
  product_name?: string;
  movement_type: InventoryMovementType;
  reason: InventoryReason | string;
  /** Cantidad del movimiento (siempre número finito >= 0; la dirección la marca el movement_type) */
  quantity: number;
  from_location_id?: number | null;
  to_location_id?: number | null;
  from_location_name?: string | null;
  to_location_name?: string | null;
  unit_cost_cents?: number | null;
  reference_type?: string | null;
  reference_id?: number | string | null;
  /** ID del movimiento original que esta reversión anula */
  reversed_movement_id?: number | null;
  is_reversal?: boolean;
  idempotency_key?: string | null;
  notes?: string | null;
  created_by?: number | null;
  created_by_name?: string | null;
  created_at: string;
};

/**
 * Saldo / Existencias de un producto en una ubicación (StockBalance)
 */
export type StockBalance = {
  id?: number;
  company_id: number;
  product_id: number;
  location_id: number;
  location_name?: string;
  warehouse_id?: number | null;
  /** Existencias físicas (debe ser >= 0 salvo política explícita de stock negativo) */
  on_hand: number;
  /** Unidades reservadas por ventas/pedidos pendientes */
  reserved: number;
  /** Unidades disponibles para venta (on_hand - reserved) */
  available: number;
  /** Unidades en camino / compras pendientes de recepción */
  incoming: number;
  min_stock?: number;
  max_stock?: number | null;
  updated_at?: string;
};

/**
 * DTO para la creación de un nuevo movimiento de inventario (CreateInventoryMovementInput)
 */
export type CreateInventoryMovementInput = {
  company_id?: number;
  product_id: number;
  movement_type: InventoryMovementType;
  reason: InventoryReason | string;
  /** Cantidad a mover (debe ser finita y > 0) */
  quantity: number;
  from_location_id?: number | null;
  to_location_id?: number | null;
  unit_cost_cents?: number | null;
  reference_type?: string | null;
  reference_id?: number | string | null;
  reversed_movement_id?: number | null;
  idempotency_key?: string | null;
  notes?: string | null;
  /** Política explícita de stock negativo (false por defecto para impedir saldos < 0) */
  allow_negative_stock?: boolean;
};

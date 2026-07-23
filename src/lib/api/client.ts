import { invoke } from "@tauri-apps/api/core";
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
  PluginConfig,
  PluginKey,
  PluginTestResult,
  PluginToolResult,
  Sale,
  SaleLineInput,
  Settings,
  TenantPlugin,
  Supplier,
  SupplierInput,
  UserInput,
  VatSummary,
  WorkCategory,
  WorkItem,
  WorkItemFilters,
  WorkItemInput,
  WorkMember,
  WorkProject,
  WorkProjectInput,
} from "../types";
import { browserApi } from "./browser-store";
import { getToken, clearSession } from "../stores/session";
import { assertTokenForCommand, PUBLIC_COMMANDS } from "./guard";
import { remoteOperatorApi, remoteOperatorLogin, type RemoteOperatorConfig } from "./remote-operator";

let remoteOperatorConfig: RemoteOperatorConfig | null = null;

/**
 * Web data plane selection:
 * - vite dev defaults to the browser/localStorage store, so local review does
 *   not need PostgreSQL or accidentally touch a production database.
 * - production builds default to the server/PostgreSQL API.
 * - VITE_CRM_MODE=local|central can explicitly override either default.
 */
export const WEB_DATA_MODE: "local" | "central" =
  import.meta.env.VITE_CRM_MODE === "local" || import.meta.env.VITE_CRM_MODE === "central"
    ? import.meta.env.VITE_CRM_MODE
    : import.meta.env.DEV
      ? "local"
      : "central";

export function configureRemoteOperator(config: RemoteOperatorConfig | null) {
  remoteOperatorConfig = config ? { endpoint: config.endpoint, tenantCode: config.tenantCode } : null;
}

export function currentRemoteOperatorConfig() {
  return remoteOperatorConfig;
}

function requireRemoteConfig() {
  if (!remoteOperatorConfig) throw new Error("CRM central no configurado");
  return remoteOperatorConfig;
}

function remoteWriteUnavailable(): never {
  throw new Error("Esta escritura aún no está disponible en CRM central; no se ha guardado nada localmente.");
}

function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

function withToken(args?: Record<string, unknown>): Record<string, unknown> {
  const token = getToken();
  return { ...(args ?? {}), token: token ?? null };
}

async function callLocal<T>(cmd: string, args: Record<string, any>, token: string | null): Promise<T> {
  switch (cmd) {
    case "public_meta": return browserApi.public_meta() as T;
    case "login": return browserApi.login(args.username, args.password || args.pin) as Promise<T>;
    case "logout": return browserApi.logout(token) as T;
    case "session_me": return browserApi.session_me(token) as Promise<T>;
    case "list_companies": return browserApi.list_companies(token) as T;
    case "get_active_company": return browserApi.get_active_company(token) as T;
    case "set_active_company": return browserApi.set_active_company(args.company_id, token) as T;
    case "billing_by_company": return browserApi.billing_by_company(token) as T;
    case "list_users": return browserApi.list_users(token) as Promise<T>;
    case "upsert_user": return browserApi.upsert_user(args.input, token) as Promise<T>;
    case "change_own_pin": return browserApi.change_own_pin(args.current_pin, args.new_pin, token) as Promise<T>;
    case "complete_forced_password_change": return browserApi.complete_forced_password_change(args.current_password, args.new_password, token) as Promise<T>;
    case "list_products": return browserApi.list_products(!!args.active_only, token) as T;
    case "upsert_product": return browserApi.upsert_product(args.input, token) as T;
    // Supplier records are not part of the browser store yet. Keep local mode
    // isolated instead of falling through to the central database.
    case "list_suppliers": return [] as T;
    case "upsert_supplier": throw new Error("Los proveedores aún requieren el CRM central");
    case "adjust_stock": return browserApi.adjust_stock(args.product_id, args.delta, args.reason, token) as T;
    case "list_customers": return browserApi.list_customers(token) as T;
    case "upsert_customer": return browserApi.upsert_customer(args.input, token) as T;
    case "create_sale": return browserApi.create_sale(args.lines, args.customer_id, args.notes, token) as T;
    case "list_sales": return browserApi.list_sales(token) as T;
    case "get_sale": return browserApi.get_sale(args.id, token) as T;
    case "cancel_sale": return browserApi.cancel_sale(args.id, token) as T;
    case "return_sale_lines": return browserApi.return_sale_lines(args.id, args.lines ?? [], token) as T;
    case "list_cash_movements": return browserApi.list_cash_movements(token) as T;
    case "create_cash_movement": return browserApi.create_cash_movement(args.input, token) as T;
    case "get_cash_balance": return browserApi.get_cash_balance(token) as T;
    case "vat_summary": return browserApi.vat_summary(args.from, args.to, token) as T;
    case "dashboard_stats": return browserApi.dashboard_stats(token) as T;
    case "get_settings": return browserApi.get_settings(token) as T;
    case "update_settings": return browserApi.update_settings(args.partial, token) as T;
    case "ai_chat": return browserApi.ai_chat(args.messages, token) as Promise<T>;
    case "ollama_health": return browserApi.ollama_health(token) as Promise<T>;
    case "reset_demo": return browserApi.reset_demo(token) as Promise<T>;
    case "export_backup": return browserApi.export_backup(token) as Promise<T>;
    case "pre_migration_backup": return browserApi.pre_migration_backup(args.reason, token) as Promise<T>;
    case "restore_backup": return browserApi.restore_backup(args.raw, token) as Promise<T>;
    case "list_work_items": return browserApi.listWorkItems(args.filters, token) as Promise<T>;
    case "upsert_work_item": return browserApi.upsertWorkItem(args.input, token) as Promise<T>;
    case "archive_work_item": return browserApi.archiveWorkItem(args.id, token) as Promise<T>;
    case "list_work_projects": return browserApi.listWorkProjects(args.status_filter, token) as Promise<T>;
    case "get_work_project": return browserApi.getWorkProject(args.id, token) as Promise<T>;
    case "upsert_work_project": return browserApi.upsertWorkProject(args.input, token) as Promise<T>;
    case "archive_work_project": return browserApi.archiveWorkProject(args.id, token) as Promise<T>;
    case "list_work_categories": return browserApi.listWorkCategories(token) as Promise<T>;
    case "upsert_work_category": return browserApi.upsertWorkCategory(args.input, token) as Promise<T>;
    case "rename_work_category": return browserApi.renameWorkCategory(args.id, args.name, token) as Promise<T>;
    case "merge_work_categories": return browserApi.mergeWorkCategory(args.source_category_id, args.target_category_id, token) as Promise<T>;
    case "archive_work_category": return browserApi.archiveWorkCategory(args.id, token) as Promise<T>;
    case "list_work_members": return browserApi.listWorkMembers(token) as Promise<T>;
    case "capture_dashboard_alert": return browserApi.captureDashboardAlert(args.input, token) as Promise<T>;
    default: throw new Error(`Comando local no soportado: ${cmd}`);
  }
}

async function call<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const payload = withToken(args);
  const token = (payload.token as string | null) ?? null;

  try {
    assertTokenForCommand(cmd, token);
  } catch (e) {
    clearSession();
    throw e;
  }

  if (!isTauri() && WEB_DATA_MODE === "local") {
    try {
      return await callLocal<T>(cmd, args ?? {}, token);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("Sesión") || msg.includes("sesión")) clearSession();
      throw e instanceof Error ? e : new Error(msg);
    }
  }

  if (isTauri()) {
    try {
      return await invoke<T>(cmd, payload);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("Sesión") || msg.includes("sesión") || msg.includes("PIN")) {
        if (!PUBLIC_COMMANDS.has(cmd)) clearSession();
      }
      throw e instanceof Error ? e : new Error(msg);
    }
  }

  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    const response = await fetch("/api/rpc", {
      method: "POST",
      headers,
      body: JSON.stringify({ cmd, args }),
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      const errMsg = errData.error || `HTTP error! status: ${response.status}`;
      throw new Error(errMsg);
    }

    return (await response.json()) as T;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("Sesión") || msg.includes("sesión")) {
      clearSession();
    }
    throw e;
  }
}

export function supportsWorkManagement(): boolean {
  if (isTauri()) return false;
  if (currentRemoteOperatorConfig() != null) return false;
  return true;
}

export const api = {
  publicMeta: () => call<{ shop_name: string }>("public_meta"),
  login: (username: string, password: string) =>
    call<LoginResult>("login", { username, password, pin: password }),
  loginRemote: (config: RemoteOperatorConfig, username: string, password: string) => {
    configureRemoteOperator(config);
    return remoteOperatorLogin(config, username, password);
  },
  logout: () => remoteOperatorConfig ? Promise.resolve() : call<void>("logout"),
  sessionMe: () => remoteOperatorConfig ? remoteOperatorApi.me(requireRemoteConfig(), getToken() ?? "") : call<AuthUser | null>("session_me"),
  listUsers: () => call<AuthUser[]>("list_users"),
  upsertUser: (input: UserInput) => call<CreateUserResult>("upsert_user", { input }),
  changeOwnPin: (currentPin: string, newPin: string) =>
    call<void>("change_own_pin", { current_pin: currentPin, new_pin: newPin }),
  completeForcedPasswordChange: (currentPassword: string, newPassword: string) =>
    call<AuthUser>("complete_forced_password_change", {
      current_password: currentPassword,
      new_password: newPassword,
    }),

  listProducts: async (activeOnly = true) => remoteOperatorConfig ? (await remoteOperatorApi.products(requireRemoteConfig(), getToken() ?? "")).filter((product) => !activeOnly || product.active) : call<Product[]>("list_products", { active_only: activeOnly }),
  upsertProduct: (input: ProductInput) => remoteOperatorConfig ? remoteOperatorApi.saveProduct(requireRemoteConfig(), getToken() ?? "", input) : call<Product>("upsert_product", { input }),
  listSuppliers: () => call<Supplier[]>("list_suppliers"),
  upsertSupplier: (input: SupplierInput) => call<Supplier>("upsert_supplier", { input }),
  adjustStock: (productId: number, delta: number, reason: string) => remoteOperatorConfig ? remoteWriteUnavailable() : call<Product>("adjust_stock", { product_id: productId, delta, reason }),
  listCustomers: () => remoteOperatorConfig ? remoteOperatorApi.customers(requireRemoteConfig(), getToken() ?? "") : call<Customer[]>("list_customers"),
  upsertCustomer: (input: CustomerInput) => remoteOperatorConfig ? remoteOperatorApi.saveCustomer(requireRemoteConfig(), getToken() ?? "", input) : call<Customer>("upsert_customer", { input }),
  createSale: (lines: SaleLineInput[], customerId?: number | null, notes?: string) =>
    remoteOperatorConfig ? remoteOperatorApi.createSale(requireRemoteConfig(), getToken() ?? "", lines, customerId ?? null, notes ?? "") : call<Sale>("create_sale", {
      lines,
      customer_id: customerId ?? null,
      notes: notes ?? "",
    }),
  listSales: () => remoteOperatorConfig ? remoteOperatorApi.sales(requireRemoteConfig(), getToken() ?? "") : call<Sale[]>("list_sales"),
  getSale: (id: number) => remoteOperatorConfig ? remoteWriteUnavailable() : call<Sale>("get_sale", { id }),
  cancelSale: (id: number) => remoteOperatorConfig ? remoteWriteUnavailable() : call<Sale>("cancel_sale", { id }),
  returnSaleLines: (id: number, lines: { line_id: number; qty: number }[]) =>
    remoteOperatorConfig ? remoteWriteUnavailable() : call<Sale>("return_sale_lines", { id, lines }),
  listCashMovements: () => remoteOperatorConfig ? remoteWriteUnavailable() : call<CashMovement[]>("list_cash_movements"),
  createCashMovement: (input: CashInput) => remoteOperatorConfig ? remoteWriteUnavailable() : call<CashMovement>("create_cash_movement", { input }),
  getCashBalance: () => remoteOperatorConfig ? remoteWriteUnavailable() : call<number>("get_cash_balance"),
  vatSummary: (from: string, to: string) => remoteOperatorConfig ? remoteWriteUnavailable() : call<VatSummary>("vat_summary", { from, to }),
  dashboardStats: () => remoteOperatorConfig ? remoteOperatorApi.dashboard(requireRemoteConfig(), getToken() ?? "") : call<DashboardStats>("dashboard_stats"),
  getSettings: () => call<Settings>("get_settings"),
  updateSettings: (partial: Partial<Settings>) =>
    call<Settings>("update_settings", { partial }),
  aiChat: (messages: AiMessage[]) => call<AiChatResult>("ai_chat", { messages }),
  ollamaHealth: () => call<{ ok: boolean; models: string[] }>("ollama_health"),
  resetDemo: () => remoteOperatorConfig ? remoteWriteUnavailable() : call<void>("reset_demo"),
  exportBackup: () => call<unknown>("export_backup"),
  preMigrationBackup: (reason: string) =>
    call<unknown>("pre_migration_backup", { reason }),
  restoreBackup: (raw: unknown) => call<void>("restore_backup", { raw }),
  listCompanies: (includeAll = false) => call<Company[]>("list_companies", { include_all: includeAll }),
  getActiveCompany: () => call<Company | null>("get_active_company"),
  setActiveCompany: (companyId: number) =>
    call<Company>("set_active_company", { company_id: companyId }),
  billingByCompany: () =>
    call<
      {
        company_id: number;
        code: string;
        trade_name: string;
        sales_count: number;
        total_cents: number;
      }[]
    >("billing_by_company"),
  listPlugins: () => call<TenantPlugin[]>("list_plugins"),
  updatePlugin: (pluginKey: PluginKey, enabled: boolean, config: PluginConfig) =>
    call<TenantPlugin>("update_plugin", { plugin_key: pluginKey, enabled, config }),
  testPlugin: (pluginKey: PluginKey) =>
    call<PluginTestResult>("test_plugin", { plugin_key: pluginKey }),
  listPluginTools: (pluginKey: PluginKey) =>
    call<any[]>("list_plugin_tools", { plugin_key: pluginKey }),
  callPluginTool: (
    pluginKey: PluginKey,
    toolName: string,
    args: Record<string, unknown>,
    confirmed = false,
  ) => call<PluginToolResult>("call_plugin_tool", {
    plugin_key: pluginKey,
    tool_name: toolName,
    arguments: args,
    confirmed,
  }),
  supportsWorkManagement,
  listWorkProjects: (statusFilter?: string) =>
    remoteOperatorConfig ? remoteWriteUnavailable() : call<WorkProject[]>("list_work_projects", { status_filter: statusFilter }),
  getWorkProject: (id: number) =>
    remoteOperatorConfig ? remoteWriteUnavailable() : call<WorkProject>("get_work_project", { id }),
  upsertWorkProject: (input: WorkProjectInput) =>
    remoteOperatorConfig ? remoteWriteUnavailable() : call<WorkProject>("upsert_work_project", { input }),
  archiveWorkProject: (id: number) =>
    remoteOperatorConfig ? remoteWriteUnavailable() : call<WorkProject>("archive_work_project", { id }),

  list_work_projects: (statusFilter?: string) =>
    remoteOperatorConfig ? remoteWriteUnavailable() : call<WorkProject[]>("list_work_projects", { status_filter: statusFilter }),
  get_work_project: (id: number) =>
    remoteOperatorConfig ? remoteWriteUnavailable() : call<WorkProject>("get_work_project", { id }),
  upsert_work_project: (input: WorkProjectInput) =>
    remoteOperatorConfig ? remoteWriteUnavailable() : call<WorkProject>("upsert_work_project", { input }),
  archive_work_project: (id: number) =>
    remoteOperatorConfig ? remoteWriteUnavailable() : call<WorkProject>("archive_work_project", { id }),

  listWorkItems: (filters?: WorkItemFilters) =>
    remoteOperatorConfig ? remoteWriteUnavailable() : call<WorkItem[]>("list_work_items", { filters }),
  upsertWorkItem: (input: WorkItemInput) =>
    remoteOperatorConfig ? remoteWriteUnavailable() : call<WorkItem>("upsert_work_item", { input }),
  archiveWorkItem: (id: number) =>
    remoteOperatorConfig ? remoteWriteUnavailable() : call<WorkItem>("archive_work_item", { id }),
  listWorkCategories: () =>
    remoteOperatorConfig ? remoteWriteUnavailable() : call<WorkCategory[]>("list_work_categories"),
  upsertWorkCategory: (input: { id?: number | null; name: string; color?: string }) =>
    remoteOperatorConfig ? remoteWriteUnavailable() : call<WorkCategory>("upsert_work_category", { input }),
  renameWorkCategory: (id: number, name: string) =>
    remoteOperatorConfig ? remoteWriteUnavailable() : call<WorkCategory>("upsert_work_category", { input: { id, name } }),
  mergeWorkCategories: (sourceCategoryId: number, targetCategoryId: number) =>
    remoteOperatorConfig ? remoteWriteUnavailable() : call<void>("merge_work_categories", { source_category_id: sourceCategoryId, target_category_id: targetCategoryId }),
  mergeWorkCategory: (sourceId: number, targetId: number) =>
    remoteOperatorConfig ? remoteWriteUnavailable() : call<WorkCategory>("merge_work_categories", { source_category_id: sourceId, target_category_id: targetId }),
  archiveWorkCategory: (id: number) =>
    remoteOperatorConfig ? remoteWriteUnavailable() : call<WorkCategory>("archive_work_category", { id }),
  listWorkMembers: () =>
    remoteOperatorConfig ? remoteWriteUnavailable() : call<WorkMember[]>("list_work_members"),
  captureDashboardAlert: (input: { alertId: string; title: string; detail: string; href: string }) =>
    remoteOperatorConfig ? remoteWriteUnavailable() : call<WorkItem>("capture_dashboard_alert", { input }),
  isTauri,
};

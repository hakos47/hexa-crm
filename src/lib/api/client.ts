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
  Sale,
  SaleLineInput,
  Settings,
  UserInput,
  VatSummary,
} from "../types";
import { browserApi } from "./browser-store";
import { getToken, clearSession } from "../stores/session";
import { assertTokenForCommand, PUBLIC_COMMANDS } from "./guard";

function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

function withToken(args?: Record<string, unknown>): Record<string, unknown> {
  const token = getToken();
  return { ...(args ?? {}), token: token ?? null };
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

export const api = {
  publicMeta: () => call<{ shop_name: string }>("public_meta"),
  login: (username: string, password: string) =>
    call<LoginResult>("login", { username, password, pin: password }),
  logout: () => call<void>("logout"),
  sessionMe: () => call<AuthUser | null>("session_me"),
  listUsers: () => call<AuthUser[]>("list_users"),
  upsertUser: (input: UserInput) => call<CreateUserResult>("upsert_user", { input }),
  changeOwnPin: (currentPin: string, newPin: string) =>
    call<void>("change_own_pin", { current_pin: currentPin, new_pin: newPin }),
  completeForcedPasswordChange: (currentPassword: string, newPassword: string) =>
    call<AuthUser>("complete_forced_password_change", {
      current_password: currentPassword,
      new_password: newPassword,
    }),

  listProducts: (activeOnly = true) =>
    call<Product[]>("list_products", { active_only: activeOnly }),
  upsertProduct: (input: ProductInput) => call<Product>("upsert_product", { input }),
  adjustStock: (productId: number, delta: number, reason: string) =>
    call<Product>("adjust_stock", { product_id: productId, delta, reason }),
  listCustomers: () => call<Customer[]>("list_customers"),
  upsertCustomer: (input: CustomerInput) => call<Customer>("upsert_customer", { input }),
  createSale: (lines: SaleLineInput[], customerId?: number | null, notes?: string) =>
    call<Sale>("create_sale", {
      lines,
      customer_id: customerId ?? null,
      notes: notes ?? "",
    }),
  listSales: () => call<Sale[]>("list_sales"),
  getSale: (id: number) => call<Sale>("get_sale", { id }),
  cancelSale: (id: number) => call<Sale>("cancel_sale", { id }),
  listCashMovements: () => call<CashMovement[]>("list_cash_movements"),
  createCashMovement: (input: CashInput) => call<CashMovement>("create_cash_movement", { input }),
  getCashBalance: () => call<number>("get_cash_balance"),
  vatSummary: (from: string, to: string) => call<VatSummary>("vat_summary", { from, to }),
  dashboardStats: () => call<DashboardStats>("dashboard_stats"),
  getSettings: () => call<Settings>("get_settings"),
  updateSettings: (partial: Partial<Settings>) =>
    call<Settings>("update_settings", { partial }),
  aiChat: (messages: AiMessage[]) => call<AiChatResult>("ai_chat", { messages }),
  ollamaHealth: () => call<{ ok: boolean; models: string[] }>("ollama_health"),
  resetDemo: () => call<void>("reset_demo"),
  exportBackup: () => call<unknown>("export_backup"),
  preMigrationBackup: (reason: string) =>
    call<unknown>("pre_migration_backup", { reason }),
  restoreBackup: (raw: unknown) => call<void>("restore_backup", { raw }),
  listCompanies: () => call<Company[]>("list_companies"),
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
  isTauri,
};

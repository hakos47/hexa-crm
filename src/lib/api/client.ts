import { invoke } from "@tauri-apps/api/core";
import type {
  AiChatResult,
  AiMessage,
  AuthUser,
  CashInput,
  CashMovement,
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
    switch (cmd) {
      case "public_meta":
        return browserApi.public_meta() as T;
      case "login":
        return (await browserApi.login(
          args?.username as string,
          (args?.password as string) ?? (args?.pin as string)
        )) as T;
      case "logout":
        browserApi.logout(token);
        return undefined as T;
      case "session_me":
        return (await browserApi.session_me(token)) as T;
      case "list_users":
        return (await browserApi.list_users(token)) as T;
      case "upsert_user":
        return (await browserApi.upsert_user(args?.input as UserInput, token)) as T;
      case "change_own_pin":
        await browserApi.change_own_pin(
          args?.current_pin as string,
          args?.new_pin as string,
          token
        );
        return undefined as T;
      case "complete_forced_password_change":
        return (await browserApi.complete_forced_password_change(
          args?.current_password as string,
          args?.new_password as string,
          token
        )) as T;
      case "list_products":
        return browserApi.list_products(
          (args?.active_only as boolean | undefined) ?? true,
          token
        ) as T;
      case "upsert_product":
        return browserApi.upsert_product(args?.input as ProductInput, token) as T;
      case "adjust_stock":
        return browserApi.adjust_stock(
          args?.product_id as number,
          args?.delta as number,
          args?.reason as string,
          token
        ) as T;
      case "list_customers":
        return browserApi.list_customers(token) as T;
      case "upsert_customer":
        return browserApi.upsert_customer(args?.input as CustomerInput, token) as T;
      case "create_sale":
        return browserApi.create_sale(
          args?.lines as SaleLineInput[],
          args?.customer_id as number | null | undefined,
          args?.notes as string | undefined,
          token
        ) as T;
      case "list_sales":
        return browserApi.list_sales(token) as T;
      case "get_sale":
        return browserApi.get_sale(args?.id as number, token) as T;
      case "list_cash_movements":
        return browserApi.list_cash_movements(token) as T;
      case "create_cash_movement":
        return browserApi.create_cash_movement(args?.input as CashInput, token) as T;
      case "get_cash_balance":
        return browserApi.get_cash_balance(token) as T;
      case "vat_summary":
        return browserApi.vat_summary(args?.from as string, args?.to as string, token) as T;
      case "dashboard_stats":
        return browserApi.dashboard_stats(token) as T;
      case "get_settings":
        return browserApi.get_settings(token) as T;
      case "update_settings":
        return browserApi.update_settings(args?.partial as Partial<Settings>, token) as T;
      case "ai_chat":
        return (await browserApi.ai_chat(args?.messages as AiMessage[], token)) as T;
      case "ollama_health":
        return (await browserApi.ollama_health(token)) as T;
      case "reset_demo":
        await browserApi.reset_demo(token);
        return undefined as T;
      default:
        throw new Error(`Comando no soportado en browser: ${cmd}`);
    }
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
  isTauri,
};

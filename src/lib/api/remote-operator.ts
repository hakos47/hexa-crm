import type { AuthUser, Customer, CustomerInput, DashboardStats, LoginResult, Product, ProductInput, Sale, SaleLineInput } from "$lib/types";

export type RemoteOperatorConfig = { endpoint: string; tenantCode: string };

type RemoteLogin = { token: string; operator: { username: string; display_name: string; role: "admin" | "cajero" }; expires_at: string };

function endpoint(config: RemoteOperatorConfig, path: string) {
  return `${config.endpoint.replace(/\/$/, "")}/api/v1/operator${path}`;
}

function asUser(operator: RemoteLogin["operator"]): AuthUser {
  return { id: 0, username: operator.username, display_name: operator.display_name, role: operator.role, active: true, created_at: new Date().toISOString(), must_change_password: false, temp_password_issued_at: null };
}

async function request<T>(config: RemoteOperatorConfig, token: string, path: string, fetchImpl: typeof fetch = fetch) {
  const response = await fetchImpl(endpoint(config, path), { headers: { authorization: `Bearer ${token}` } });
  if (!response.ok) throw new Error(response.status === 401 ? "Sesión central no válida" : "CRM central no disponible");
  return await response.json() as T;
}

async function mutate<T>(config: RemoteOperatorConfig, token: string, path: string, payload: unknown, fetchImpl: typeof fetch = fetch) {
  const response = await fetchImpl(endpoint(config, path), { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}`, "Idempotency-Key": crypto.randomUUID() }, body: JSON.stringify(payload) });
  const data = await response.json().catch(() => ({})) as T & { error?: string };
  if (!response.ok) throw new Error(data.error ?? "No se pudo completar la operación en CRM central");
  return data;
}

export async function remoteOperatorLogin(config: RemoteOperatorConfig, username: string, password: string, fetchImpl: typeof fetch = fetch): Promise<LoginResult> {
  const response = await fetchImpl(endpoint(config, "/login"), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ tenant_code: config.tenantCode, username, password }) });
  const data = await response.json().catch(() => ({})) as Partial<RemoteLogin> & { error?: string };
  if (!response.ok || !data.token || !data.operator) throw new Error(data.error ?? "No se pudo iniciar sesión en CRM central");
  return { user: asUser(data.operator), token: data.token, companies: [], active_company_id: null };
}

export const remoteOperatorApi = {
  me: async (config: RemoteOperatorConfig, token: string, fetchImpl?: typeof fetch) => {
    const data = await request<{ operator: RemoteLogin["operator"] }>(config, token, "/me", fetchImpl);
    return asUser(data.operator);
  },
  products: async (config: RemoteOperatorConfig, token: string, fetchImpl?: typeof fetch) => {
    const data = await request<{ data: Product[] }>(config, token, "/products", fetchImpl);
    return data.data;
  },
  customers: async (config: RemoteOperatorConfig, token: string, fetchImpl?: typeof fetch) => {
    const data = await request<{ data: Customer[] }>(config, token, "/customers", fetchImpl);
    return data.data;
  },
  sales: async (config: RemoteOperatorConfig, token: string, fetchImpl?: typeof fetch) => {
    const data = await request<{ data: Sale[] }>(config, token, "/sales", fetchImpl);
    return data.data;
  },
  dashboard: async (config: RemoteOperatorConfig, token: string, fetchImpl?: typeof fetch) =>
    request<DashboardStats & { synchronized_at: string }>(config, token, "/dashboard", fetchImpl),
  saveProduct: (config: RemoteOperatorConfig, token: string, input: ProductInput, fetchImpl?: typeof fetch) => mutate<Product>(config, token, "/products", input, fetchImpl),
  saveCustomer: (config: RemoteOperatorConfig, token: string, input: CustomerInput, fetchImpl?: typeof fetch) => mutate<Customer>(config, token, "/customers", input, fetchImpl),
  createSale: (config: RemoteOperatorConfig, token: string, lines: SaleLineInput[], customerId: number | null, notes: string, fetchImpl?: typeof fetch) => mutate<Sale>(config, token, "/sales", { lines, customer_id: customerId, notes }, fetchImpl),
};

import { describe, expect, it } from "vitest";
import { remoteOperatorApi, remoteOperatorLogin } from "./remote-operator";

const config = { endpoint: "https://crm.example/", tenantCode: "MEIGA" };

describe("remote operator adapter", () => {
  it("logs an operator into its configured tenant", async () => {
    const fetchImpl = async (input: string | URL | Request, init?: RequestInit) => {
      expect(String(input)).toBe("https://crm.example/api/v1/operator/login");
      expect(JSON.parse(String(init?.body))).toMatchObject({ tenant_code: "MEIGA", username: "operador" });
      return new Response(JSON.stringify({ token: "token", operator: { username: "operador", display_name: "Operador", role: "admin" }, expires_at: "2026-01-01" }));
    };
    await expect(remoteOperatorLogin(config, "operador", "clave", fetchImpl as typeof fetch)).resolves.toMatchObject({ token: "token", user: { username: "operador" } });
  });

  it("reads remote inventory with the operator bearer token", async () => {
    const fetchImpl = async (input: string | URL | Request, init?: RequestInit) => {
      expect(String(input)).toBe("https://crm.example/api/v1/operator/products");
      expect(new Headers(init?.headers).get("authorization")).toBe("Bearer token");
      return new Response(JSON.stringify({ data: [{ id: 1, sku: "A", name: "Producto", description: "", category: "", stock: 1, min_stock: 0, cost_cents: 0, price_cents: 100, vat_rate: 21, active: true, created_at: "", updated_at: "" }] }));
    };
    await expect(remoteOperatorApi.products(config, "token", fetchImpl as typeof fetch)).resolves.toHaveLength(1);
  });
});

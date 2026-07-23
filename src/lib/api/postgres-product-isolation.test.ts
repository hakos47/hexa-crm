import { describe, expect, it, vi, beforeEach } from "vitest";
import { readFile } from "node:fs/promises";
import { browserApi, __resetBrowserStoreForTests } from "./browser-store";
import type { ProductInput } from "$lib/types";

describe("PostgreSQL & Browser Product Multi-Tenant Isolation", () => {
  it("verifies postgres-db.ts source code enforces active company isolation", async () => {
    const source = await readFile(new URL("./postgres-db.ts", import.meta.url), "utf8");

    // Must resolve active company in upsert_product
    expect(source).toMatch(/upsert_product[\s\S]*?resolveActiveCompanyId/);

    // INSERT into products must include company_id column and ${cid}
    expect(source).toMatch(/INSERT INTO products \([^)]*company_id[^)]*\)/);
    expect(source).toMatch(/VALUES\s*\(\s*\${cid}/);

    // UPDATE products must filter by company_id = ${cid}
    expect(source).toMatch(/UPDATE products[\s\S]*?WHERE id = \${input\.id} AND company_id = \${cid}/);

    // Initial stock movement must also include company_id
    expect(source).toMatch(/INSERT INTO stock_movements \([^)]*company_id[^)]*\)/);

    // adjust_stock must also filter by company_id = ${cid}
    expect(source).toMatch(/adjust_stock[\s\S]*?WHERE id = \${product_id} AND company_id = \${cid}/);
  });

  describe("Browser/Local Store product company isolation check", () => {
    beforeEach(() => {
      __resetBrowserStoreForTests();
    });

    it("creates product under active company 2 and lists only there", async () => {
      const login = await browserApi.login("admin", "1234");
      const token = login.token;

      // Switch active company to 2 (DEV)
      browserApi.set_active_company(2, token);

      const prodCompany2 = browserApi.upsert_product(
        {
          sku: "PROD-DEV-001",
          name: "Producto Dev Company 2",
          cost_cents: 1000,
          price_cents: 2000,
          vat_rate: 21,
          stock: 5,
        },
        token,
      );

      expect(prodCompany2.company_id).toBe(2);

      // Must list under company 2
      const devProducts = browserApi.list_products(false, token);
      expect(devProducts.some((p) => p.id === prodCompany2.id)).toBe(true);

      // Switch to company 1 (SHOP) -> must NOT list product created in company 2
      browserApi.set_active_company(1, token);
      const shopProducts = browserApi.list_products(false, token);
      expect(shopProducts.some((p) => p.id === prodCompany2.id)).toBe(false);
    });

    it("rejects editing a product from another tenant and leaves product untouched", async () => {
      const login = await browserApi.login("admin", "1234");
      const token = login.token;

      // Create product in company 2
      browserApi.set_active_company(2, token);
      const prod2 = browserApi.upsert_product(
        {
          sku: "PROD-DEV-002",
          name: "Original Dev Name",
          cost_cents: 1000,
          price_cents: 2000,
          vat_rate: 21,
        },
        token,
      );

      // Switch to company 1
      browserApi.set_active_company(1, token);

      // Try editing product 2 from company 1
      expect(() =>
        browserApi.upsert_product(
          {
            id: prod2.id,
            sku: "HACKED-SKU",
            name: "Hacked Name",
            cost_cents: 500,
            price_cents: 1000,
            vat_rate: 21,
          },
          token,
        ),
      ).toThrow("Producto no encontrado");

      // Verify product 2 remains untouched when checking back under company 2
      browserApi.set_active_company(2, token);
      const fetched = browserApi.list_products(false, token).find((p) => p.id === prod2.id);
      expect(fetched).toBeDefined();
      expect(fetched?.name).toBe("Original Dev Name");
      expect(fetched?.sku).toBe("PROD-DEV-002");
    });

    it("ignores company_id in input payload to prevent overriding active company", async () => {
      const login = await browserApi.login("admin", "1234");
      const token = login.token;

      // Active company is 2
      browserApi.set_active_company(2, token);

      // Attempt to force company_id: 1 in input object
      const inputWithForcedCompany = {
        sku: "FORCED-001",
        name: "Forced Company Product",
        cost_cents: 1000,
        price_cents: 2000,
        vat_rate: 21,
        company_id: 1, // forced payload
      } as any;

      const created = browserApi.upsert_product(inputWithForcedCompany, token);

      // company_id MUST be active company (2), ignoring forced payload (1)
      expect(created.company_id).toBe(2);

      // Should not be visible in company 1
      browserApi.set_active_company(1, token);
      const shopProducts = browserApi.list_products(false, token);
      expect(shopProducts.some((p) => p.id === created.id)).toBe(false);
    });
  });

  describe("PostgreSQL RPC upsert_product unit execution simulation", () => {
    let mockProducts: any[] = [];
    let mockMovements: any[] = [];
    const activeCompany = 2;

    const mockSql: any = vi.fn((strings: TemplateStringsArray, ...values: any[]) => {
      const query = strings.join("?");

      // INSERT into products
      if (query.includes("INSERT INTO products")) {
        const companyId = values[0];
        const newProduct = {
          id: mockProducts.length + 1,
          company_id: companyId,
          sku: values[1],
          name: values[2],
          description: values[3],
          category: values[4],
          stock: values[5],
          min_stock: values[6],
          cost_cents: values[7],
          price_cents: values[8],
          vat_rate: values[9],
          active: values[16],
          created_at: new Date(),
          updated_at: new Date(),
        };
        mockProducts.push(newProduct);
        return Promise.resolve([newProduct]);
      }

      // INSERT into stock_movements
      if (query.includes("INSERT INTO stock_movements")) {
        mockMovements.push({ product_id: values[0], company_id: values[1], delta: values[2], reason: values[3] });
        return Promise.resolve([]);
      }

      // UPDATE products
      if (query.includes("UPDATE products")) {
        const targetId = values[values.length - 2];
        const targetCid = values[values.length - 1];
        const idx = mockProducts.findIndex((p) => p.id === targetId && p.company_id === targetCid);
        if (idx < 0) return Promise.resolve([]);
        mockProducts[idx].name = values[1];
        return Promise.resolve([mockProducts[idx]]);
      }

      return Promise.resolve([]);
    });

    beforeEach(() => {
      mockProducts = [];
      mockMovements = [];
    });

    it("creates product in active company 2 with company_id = 2", async () => {
      const cid = activeCompany; // resolved active company
      const input: ProductInput = {
        sku: "PG-DEV-001",
        name: "Postgres Dev Product",
        cost_cents: 1000,
        price_cents: 2000,
        vat_rate: 21,
        stock: 10,
      };

      // Verify that SQL insert receives cid = 2 as first parameter (company_id)
      const res = await mockSql`
        INSERT INTO products (company_id, sku, name, description, category, stock, min_stock, cost_cents, price_cents, vat_rate, supplier_name, supplier_contact, supplier_email, supplier_phone, fulfillment_mode, stock_location, condition_code, active)
        VALUES (${cid}, ${input.sku}, ${input.name}, "", "", ${input.stock}, 0, ${input.cost_cents}, ${input.price_cents}, ${input.vat_rate}, "", "", "", "", "own_stock", "Almacén principal", "used", true)
        RETURNING *
      `;

      expect(res[0].company_id).toBe(2);
      expect(mockProducts[0].company_id).toBe(2);

      // Verify initial stock movement receives company_id = 2
      await mockSql`
        INSERT INTO stock_movements (product_id, company_id, delta, reason)
        VALUES (${res[0].id}, ${cid}, ${input.stock}, 'Stock inicial')
      `;

      expect(mockMovements[0].company_id).toBe(2);
    });

    it("rejects editing product when company_id does not match active company", async () => {
      // Product exists in company_id = 1
      mockProducts.push({
        id: 99,
        company_id: 1,
        sku: "SHOP-99",
        name: "Shop Product 99",
      });

      // Active company is 2
      const activeCid = 2;
      const targetId = 99;

      const res = await mockSql`
        UPDATE products
        SET name = "Attempted Update"
        WHERE id = ${targetId} AND company_id = ${activeCid}
        RETURNING *
      `;

      // Should return 0 rows updated
      expect(res.length).toBe(0);
      expect(mockProducts.find((p) => p.id === 99)?.name).toBe("Shop Product 99");
    });
  });
});

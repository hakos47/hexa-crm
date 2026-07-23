import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";

describe("Inventory Foundation (Phase 1)", () => {
  it("defines schema, migrations, and RLS policies in postgres-db.ts", async () => {
    const source = await readFile(new URL("./postgres-db.ts", import.meta.url), "utf8");

    expect(source).toContain("0016_inventory_foundation");
    expect(source).toContain("CREATE TABLE IF NOT EXISTS warehouses");
    expect(source).toContain("CREATE TABLE IF NOT EXISTS stock_locations");
    expect(source).toContain("CREATE TABLE IF NOT EXISTS stock_balances");
    expect(source).toContain("CREATE TABLE IF NOT EXISTS inventory_movements");

    for (const table of ["warehouses", "stock_locations", "stock_balances", "inventory_movements"]) {
      expect(source).toContain(`"${table}"`);
    }

    expect(source).toContain("seedInventoryFoundation");
    expect(source).toContain("WH-MAIN");
    expect(source).toContain("LOC-MAIN");
    expect(source).toContain("initial_stock");
  });

  it("implements postgresApi inventory methods", async () => {
    const source = await readFile(new URL("./postgres-db.ts", import.meta.url), "utf8");

    expect(source).toContain("async list_warehouses");
    expect(source).toContain("async list_stock_locations");
    expect(source).toContain("async list_stock_balances");
    expect(source).toContain("async list_inventory_movements");
    expect(source).toContain("async create_inventory_movement");
    expect(source).toContain("async reverse_inventory_movement");

    expect(source).toContain("sql.begin");
    expect(source).toContain("allow_negative_stock");
    expect(source).toContain("UPDATE products");
  });

  it("handles inventory RPC commands in +server.ts", async () => {
    const source = await readFile(new URL("../../routes/api/rpc/+server.ts", import.meta.url), "utf8");

    expect(source).toContain('case "list_warehouses":');
    expect(source).toContain('case "list_stock_locations":');
    expect(source).toContain('case "list_stock_balances":');
    expect(source).toContain('case "list_inventory_movements":');
    expect(source).toContain('case "create_inventory_movement":');
    expect(source).toContain('case "reverse_inventory_movement":');
  });

  it("exposes inventory methods on api client", async () => {
    const source = await readFile(new URL("./client.ts", import.meta.url), "utf8");

    expect(source).toContain("listWarehouses");
    expect(source).toContain("listStockLocations");
    expect(source).toContain("listStockBalances");
    expect(source).toContain("listInventoryMovements");
    expect(source).toContain("createInventoryMovement");
    expect(source).toContain("reverseInventoryMovement");
  });
});

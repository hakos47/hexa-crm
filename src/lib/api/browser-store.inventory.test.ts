import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  browserApi,
  __resetBrowserStoreForTests,
  __browserStoreKeyForTests,
  __legacyBrowserStoreKeysForTests,
} from "./browser-store";

function installLocalStoragePolyfill() {
  const store = new Map<string, string>();
  const localStoragePolyfill = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => store.set(key, String(value)),
    removeItem: (key: string) => store.delete(key),
    clear: () => store.clear(),
  };
  Object.defineProperty(globalThis, "localStorage", {
    value: localStoragePolyfill,
    configurable: true,
    writable: true,
  });
}

describe("Browser Store v7 & Inventory Operations Foundation", () => {
  let adminToken: string;

  beforeEach(async () => {
    installLocalStoragePolyfill();
    __resetBrowserStoreForTests();
    const loginRes = await browserApi.login("admin", "1234");
    adminToken = loginRes.token;
  });

  afterEach(() => {
    __resetBrowserStoreForTests();
    // @ts-expect-error cleanup polyfill
    delete globalThis.localStorage;
  });

  it("stores canonical KEY as hexa-crm-store-v7 and includes hexa-crm-store-v6 in legacy keys", () => {
    expect(__browserStoreKeyForTests()).toBe("hexa-crm-store-v7");
    expect(__legacyBrowserStoreKeysForTests()).toContain("hexa-crm-store-v6");
  });

  it("auto-seeds default warehouse and location per company on load", () => {
    const warehouses = browserApi.list_warehouses(adminToken);
    expect(warehouses.length).toBeGreaterThanOrEqual(1);
    const defaultWh = warehouses.find((w) => w.code === "WH-MAIN");
    expect(defaultWh).toBeDefined();
    expect(defaultWh?.name).toBe("Almacén Principal");

    const locations = browserApi.list_stock_locations(defaultWh?.id, adminToken);
    expect(locations.length).toBeGreaterThanOrEqual(1);
    const defaultLoc = locations.find((l) => l.code === "LOC-MAIN");
    expect(defaultLoc).toBeDefined();
    expect(defaultLoc?.name).toBe("Ubicación Principal");
  });

  it("seeds initial stock balances and initial_stock movements for products with stock > 0", () => {
    const products = browserApi.list_products(true, adminToken);
    const positiveStockProduct = products.find((p) => p.stock > 0);
    expect(positiveStockProduct).toBeDefined();

    const balances = browserApi.list_stock_balances({ product_id: positiveStockProduct!.id }, adminToken);
    expect(balances.length).toBeGreaterThanOrEqual(1);
    expect(balances[0].on_hand).toBe(positiveStockProduct!.stock);

    const movements = browserApi.list_inventory_movements({ product_id: positiveStockProduct!.id }, adminToken);
    expect(movements.length).toBeGreaterThanOrEqual(1);
    const initialMov = movements.find((m) => m.reason === "initial_stock");
    expect(initialMov).toBeDefined();
    expect(initialMov?.quantity).toBe(positiveStockProduct!.stock);
  });

  it("supports creating in/out/transfer inventory movements and updates stock balances and product stock", () => {
    const products = browserApi.list_products(true, adminToken);
    const p = products[0];
    const initialStock = p.stock;

    const locations = browserApi.list_stock_locations(null, adminToken);
    const mainLoc = locations[0];

    // Create IN movement
    const inMov = browserApi.create_inventory_movement(
      {
        product_id: p.id,
        movement_type: "in",
        reason: "purchase_receive",
        quantity: 15,
        to_location_id: mainLoc.id,
        notes: "Entrada de prueba",
      },
      adminToken
    );

    expect(inMov.id).toBeGreaterThan(0);
    expect(inMov.quantity).toBe(15);

    const updatedP = browserApi.list_products(true, adminToken).find((x) => x.id === p.id);
    expect(updatedP?.stock).toBe(initialStock + 15);

    // Create OUT movement
    const outMov = browserApi.create_inventory_movement(
      {
        product_id: p.id,
        movement_type: "out",
        reason: "internal_use",
        quantity: 5,
        from_location_id: mainLoc.id,
      },
      adminToken
    );

    expect(outMov.quantity).toBe(5);
    const finalP = browserApi.list_products(true, adminToken).find((x) => x.id === p.id);
    expect(finalP?.stock).toBe(initialStock + 10);
  });

  it("enforces negative stock policy when allow_negative_stock is false", () => {
    const products = browserApi.list_products(true, adminToken);
    const p = products[0];
    const locations = browserApi.list_stock_locations(null, adminToken);
    const mainLoc = locations[0];

    const balances = browserApi.list_stock_balances({ product_id: p.id, location_id: mainLoc.id }, adminToken);
    const currentStock = balances[0]?.on_hand ?? 0;

    expect(() => {
      browserApi.create_inventory_movement(
        {
          product_id: p.id,
          movement_type: "out",
          reason: "loss_theft",
          quantity: currentStock + 9999,
          from_location_id: mainLoc.id,
          allow_negative_stock: false,
        },
        adminToken
      );
    }).toThrow("Stock insuficiente");
  });

  it("reverses inventory movements correctly", () => {
    const products = browserApi.list_products(true, adminToken);
    const p = products[0];
    const locations = browserApi.list_stock_locations(null, adminToken);
    const mainLoc = locations[0];

    const inMov = browserApi.create_inventory_movement(
      {
        product_id: p.id,
        movement_type: "in",
        reason: "purchase_receive",
        quantity: 20,
        to_location_id: mainLoc.id,
      },
      adminToken
    );

    const stockBeforeReversal = browserApi.list_products(true, adminToken).find((x) => x.id === p.id)!.stock;

    const revMov = browserApi.reverse_inventory_movement(inMov.id, "Error en albarán", adminToken);
    expect(revMov.is_reversal).toBe(true);
    expect(revMov.reversed_movement_id).toBe(inMov.id);

    const stockAfterReversal = browserApi.list_products(true, adminToken).find((x) => x.id === p.id)!.stock;
    expect(stockAfterReversal).toBe(stockBeforeReversal - 20);

    // Attempting to reverse an already reversed movement throws
    expect(() => {
      browserApi.reverse_inventory_movement(inMov.id, undefined, adminToken);
    }).toThrow("ya ha sido anulado");

    // Attempting to reverse a reversal movement throws
    expect(() => {
      browserApi.reverse_inventory_movement(revMov.id, undefined, adminToken);
    }).toThrow("No se puede anular una anulación");
  });

  it("exports backup including warehouses, stockLocations, stockBalances, inventoryMovements and restores cleanly", async () => {
    const backup = await browserApi.export_backup(adminToken);
    expect(backup).toBeDefined();
    expect(backup.payload).toBeDefined();

    const payload = backup.payload as any;
    expect(Array.isArray(payload.warehouses)).toBe(true);
    expect(Array.isArray(payload.stockLocations)).toBe(true);
    expect(Array.isArray(payload.stockBalances)).toBe(true);
    expect(Array.isArray(payload.inventoryMovements)).toBe(true);

    __resetBrowserStoreForTests();

    // Re-login after wipe
    const loginRes = await browserApi.login("admin", "1234");
    const newToken = loginRes.token;

    await browserApi.restore_backup(backup, newToken);

    const postRestoreLogin = await browserApi.login("admin", "1234");
    const restoredWarehouses = browserApi.list_warehouses(postRestoreLogin.token);
    const company1Warehouses = payload.warehouses.filter((w: any) => w.company_id === 1);
    expect(restoredWarehouses.length).toBe(company1Warehouses.length);
  });
});

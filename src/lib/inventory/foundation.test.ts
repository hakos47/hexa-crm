import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  browserApi,
  __resetBrowserStoreForTests,
} from "../api/browser-store";

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

describe("Phase 1 Inventory Operations Foundation", () => {
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

  it("1. Multi-tenant isolation between 2 companies (warehouses, locations, stock balances, movements)", async () => {
    // Admin is in Company 1 (SHOP) by default
    const comp1Warehouses = browserApi.list_warehouses(adminToken);
    const comp1Locations = browserApi.list_stock_locations(null, adminToken);
    const comp1Balances = browserApi.list_stock_balances({}, adminToken);
    const comp1Movements = browserApi.list_inventory_movements({}, adminToken);

    expect(comp1Warehouses.every((w) => w.company_id === 1)).toBe(true);
    expect(comp1Locations.every((l) => l.company_id === 1)).toBe(true);
    expect(comp1Balances.every((b) => b.company_id === 1)).toBe(true);
    expect(comp1Movements.every((m) => m.company_id === 1)).toBe(true);

    const comp1Product = browserApi.list_products(true, adminToken)[0];

    // Create a movement in Company 1
    const comp1Mov = browserApi.create_inventory_movement(
      {
        product_id: comp1Product.id,
        movement_type: "in",
        reason: "purchase_receive",
        quantity: 100,
        to_location_id: comp1Locations[0].id,
      },
      adminToken
    );
    expect(comp1Mov.company_id).toBe(1);

    // Switch to Company 2 (DEV)
    const company2 = browserApi.set_active_company(2, adminToken);
    expect(company2.id).toBe(2);

    const comp2Warehouses = browserApi.list_warehouses(adminToken);
    const comp2Locations = browserApi.list_stock_locations(null, adminToken);
    const comp2Balances = browserApi.list_stock_balances({}, adminToken);
    const comp2Movements = browserApi.list_inventory_movements({}, adminToken);

    expect(comp2Warehouses.every((w) => w.company_id === 2)).toBe(true);
    expect(comp2Locations.every((l) => l.company_id === 2)).toBe(true);
    expect(comp2Balances.every((b) => b.company_id === 2)).toBe(true);
    expect(comp2Movements.every((m) => m.company_id === 2)).toBe(true);

    // Movement from Company 1 should NOT be visible in Company 2 list
    expect(comp2Movements.some((m) => m.id === comp1Mov.id)).toBe(false);

    // Attempting to operate on Company 1 product while active in Company 2 throws
    expect(() => {
      browserApi.create_inventory_movement(
        {
          product_id: comp1Product.id,
          movement_type: "in",
          reason: "purchase_receive",
          quantity: 10,
          to_location_id: comp2Locations[0]?.id,
        },
        adminToken
      );
    }).toThrow("Producto no encontrado");

    // Switch back to Company 1
    browserApi.set_active_company(1, adminToken);
    const comp1MovementsAfter = browserApi.list_inventory_movements({}, adminToken);
    expect(comp1MovementsAfter.some((m) => m.id === comp1Mov.id)).toBe(true);
  });

  it("2. Automatic migration of scalar stock to initial stock balances and initial_stock movements", () => {
    const products = browserApi.list_products(true, adminToken);
    const positiveStockProducts = products.filter((p) => p.stock > 0);
    expect(positiveStockProducts.length).toBeGreaterThan(0);

    for (const prod of positiveStockProducts) {
      const balances = browserApi.list_stock_balances({ product_id: prod.id }, adminToken);
      expect(balances.length).toBeGreaterThanOrEqual(1);

      const totalOnHand = balances.reduce((acc, b) => acc + b.on_hand, 0);
      expect(totalOnHand).toBe(prod.stock);

      const movements = browserApi.list_inventory_movements({ product_id: prod.id }, adminToken);
      const initialMov = movements.find((m) => m.reason === "initial_stock");
      expect(initialMov).toBeDefined();
      expect(initialMov?.quantity).toBeGreaterThan(0);
      expect(initialMov?.to_location_id).toBeDefined();
    }
  });

  it("3. Idempotency of inventory movements (same idempotency key does not duplicate stock/movements)", () => {
    const product = browserApi.list_products(true, adminToken)[0];
    const location = browserApi.list_stock_locations(null, adminToken)[0];
    const initialStock = product.stock;

    const idempotencyKey = "tx-idempotent-key-9999";

    const mov1 = browserApi.create_inventory_movement(
      {
        product_id: product.id,
        movement_type: "in",
        reason: "purchase_receive",
        quantity: 25,
        to_location_id: location.id,
        idempotency_key: idempotencyKey,
      },
      adminToken
    );

    expect(mov1.id).toBeGreaterThan(0);
    expect(mov1.idempotency_key).toBe(idempotencyKey);

    const stockAfterMov1 = browserApi.list_products(true, adminToken).find((p) => p.id === product.id)!.stock;
    expect(stockAfterMov1).toBe(initialStock + 25);

    // Repeat identical movement with same idempotency key
    const mov2 = browserApi.create_inventory_movement(
      {
        product_id: product.id,
        movement_type: "in",
        reason: "purchase_receive",
        quantity: 25,
        to_location_id: location.id,
        idempotency_key: idempotencyKey,
      },
      adminToken
    );

    // Must return exact same movement without duplicating stock or movement record
    expect(mov2.id).toBe(mov1.id);
    expect(mov2.idempotency_key).toBe(idempotencyKey);

    const stockAfterMov2 = browserApi.list_products(true, adminToken).find((p) => p.id === product.id)!.stock;
    expect(stockAfterMov2).toBe(stockAfterMov1);

    const movements = browserApi.list_inventory_movements({ product_id: product.id }, adminToken);
    const matchingMovements = movements.filter((m) => m.idempotency_key === idempotencyKey);
    expect(matchingMovements).toHaveLength(1);
  });

  it("4. Reversal of inventory movements (reversal movement created, is_reversal=true, reversed_movement_id linked, balances updated)", () => {
    const product = browserApi.list_products(true, adminToken)[0];
    const location = browserApi.list_stock_locations(null, adminToken)[0];
    const stockBefore = product.stock;

    const origMov = browserApi.create_inventory_movement(
      {
        product_id: product.id,
        movement_type: "in",
        reason: "purchase_receive",
        quantity: 40,
        to_location_id: location.id,
      },
      adminToken
    );

    const stockAfterIn = browserApi.list_products(true, adminToken).find((p) => p.id === product.id)!.stock;
    expect(stockAfterIn).toBe(stockBefore + 40);

    const revMov = browserApi.reverse_inventory_movement(
      origMov.id,
      "Error de digitación",
      adminToken
    );

    expect(revMov.movement_type).toBe("reversal");
    expect(revMov.is_reversal).toBe(true);
    expect(revMov.reversed_movement_id).toBe(origMov.id);
    expect(revMov.quantity).toBe(40);

    const stockAfterReversal = browserApi.list_products(true, adminToken).find((p) => p.id === product.id)!.stock;
    expect(stockAfterReversal).toBe(stockBefore);

    // Attempting to reverse again throws
    expect(() => {
      browserApi.reverse_inventory_movement(origMov.id, "Segundo intento", adminToken);
    }).toThrow("ya ha sido anulado");

    // Attempting to reverse a reversal movement throws
    expect(() => {
      browserApi.reverse_inventory_movement(revMov.id, "Anular la anulación", adminToken);
    }).toThrow("No se puede anular una anulación");
  });

  it("5. Negative stock policy rejection (throws error when available stock goes negative and allow_negative_stock is false)", () => {
    const product = browserApi.list_products(true, adminToken)[0];
    const location = browserApi.list_stock_locations(null, adminToken)[0];

    const balances = browserApi.list_stock_balances({ product_id: product.id, location_id: location.id }, adminToken);
    const currentOnHand = balances[0]?.on_hand ?? 0;

    // Should throw when allow_negative_stock is false or omitted
    expect(() => {
      browserApi.create_inventory_movement(
        {
          product_id: product.id,
          movement_type: "out",
          reason: "loss_theft",
          quantity: currentOnHand + 500,
          from_location_id: location.id,
          allow_negative_stock: false,
        },
        adminToken
      );
    }).toThrow("Stock insuficiente");

    // When allow_negative_stock is true, it succeeds
    const negMov = browserApi.create_inventory_movement(
      {
        product_id: product.id,
        movement_type: "out",
        reason: "loss_theft",
        quantity: currentOnHand + 50,
        from_location_id: location.id,
        allow_negative_stock: true,
      },
      adminToken
    );

    expect(negMov.quantity).toBe(currentOnHand + 50);
    const updatedBalance = browserApi.list_stock_balances(
      { product_id: product.id, location_id: location.id },
      adminToken
    )[0];
    expect(updatedBalance.on_hand).toBe(-50);
  });

  it("6. Reconstruction of total stock balance from movement history", () => {
    const product = browserApi.list_products(true, adminToken)[0];
    const locations = browserApi.list_stock_locations(null, adminToken);
    const loc1 = locations[0];
    const loc2 = locations[1] ?? browserApi.list_stock_locations(null, adminToken)[0];

    // Perform series of movements
    const movIn = browserApi.create_inventory_movement(
      {
        product_id: product.id,
        movement_type: "in",
        reason: "purchase_receive",
        quantity: 30,
        to_location_id: loc1.id,
      },
      adminToken
    );

    const movOut = browserApi.create_inventory_movement(
      {
        product_id: product.id,
        movement_type: "out",
        reason: "internal_use",
        quantity: 10,
        from_location_id: loc1.id,
      },
      adminToken
    );

    if (loc2.id !== loc1.id) {
      browserApi.create_inventory_movement(
        {
          product_id: product.id,
          movement_type: "transfer",
          reason: "transfer",
          quantity: 5,
          from_location_id: loc1.id,
          to_location_id: loc2.id,
        },
        adminToken
      );
    }

    browserApi.reverse_inventory_movement(movOut.id, "Reversión de salida", adminToken);

    // Reconstruct stock balance for loc1 from movement history
    const allMovements = browserApi.list_inventory_movements({ product_id: product.id }, adminToken);

    let reconstructedLoc1OnHand = 0;
    for (const m of allMovements) {
      if (m.to_location_id === loc1.id) {
        reconstructedLoc1OnHand += m.quantity;
      }
      if (m.from_location_id === loc1.id) {
        reconstructedLoc1OnHand -= m.quantity;
      }
    }

    const actualLoc1Balance = browserApi.list_stock_balances(
      { product_id: product.id, location_id: loc1.id },
      adminToken
    )[0];

    expect(reconstructedLoc1OnHand).toBe(actualLoc1Balance.on_hand);

    // Reconstruct global stock from movement history
    let reconstructedGlobalStock = 0;
    for (const m of allMovements) {
      if (m.to_location_id && !m.from_location_id) {
        reconstructedGlobalStock += m.quantity;
      } else if (m.from_location_id && !m.to_location_id) {
        reconstructedGlobalStock -= m.quantity;
      }
    }

    const actualProductStock = browserApi.list_products(true, adminToken).find((p) => p.id === product.id)!.stock;
    expect(reconstructedGlobalStock).toBe(actualProductStock);
  });

  it("7. Validation of non-negative and non-NaN movement quantities", () => {
    const product = browserApi.list_products(true, adminToken)[0];
    const location = browserApi.list_stock_locations(null, adminToken)[0];

    // Zero quantity
    expect(() => {
      browserApi.create_inventory_movement(
        {
          product_id: product.id,
          movement_type: "in",
          reason: "purchase_receive",
          quantity: 0,
          to_location_id: location.id,
        },
        adminToken
      );
    }).toThrow("mayor que cero");

    // Negative quantity
    expect(() => {
      browserApi.create_inventory_movement(
        {
          product_id: product.id,
          movement_type: "in",
          reason: "purchase_receive",
          quantity: -15,
          to_location_id: location.id,
        },
        adminToken
      );
    }).toThrow("mayor que cero");

    // NaN quantity
    expect(() => {
      browserApi.create_inventory_movement(
        {
          product_id: product.id,
          movement_type: "in",
          reason: "purchase_receive",
          quantity: NaN,
          to_location_id: location.id,
        },
        adminToken
      );
    }).toThrow("mayor que cero");

    // Infinity quantity
    expect(() => {
      browserApi.create_inventory_movement(
        {
          product_id: product.id,
          movement_type: "in",
          reason: "purchase_receive",
          quantity: Infinity,
          to_location_id: location.id,
        },
        adminToken
      );
    }).toThrow("mayor que cero");

    // Valid positive quantity succeeds
    const validMov = browserApi.create_inventory_movement(
      {
        product_id: product.id,
        movement_type: "in",
        reason: "purchase_receive",
        quantity: 12.5,
        to_location_id: location.id,
      },
      adminToken
    );
    expect(validMov.quantity).toBe(12.5);
  });

  it("8. Error handling on invalid token or company access violation", async () => {
    const invalidToken = "invalid-token-xyz-123";

    expect(() => browserApi.list_warehouses(invalidToken)).toThrow(/invalid|inválido|sesión/i);
    expect(() => browserApi.list_stock_locations(null, invalidToken)).toThrow(/invalid|inválido|sesión/i);
    expect(() => browserApi.list_stock_balances({}, invalidToken)).toThrow(/invalid|inválido|sesión/i);
    expect(() => browserApi.list_inventory_movements({}, invalidToken)).toThrow(/invalid|inválido|sesión/i);

    expect(() => {
      browserApi.create_inventory_movement(
        {
          product_id: 1,
          movement_type: "in",
          reason: "purchase_receive",
          quantity: 10,
          to_location_id: 1,
        },
        invalidToken
      );
    }).toThrow(/invalid|inválido|sesión/i);

    expect(() => {
      browserApi.reverse_inventory_movement(1, "Anulación", invalidToken);
    }).toThrow(/invalid|inválido|sesión/i);

    // Company access violation: cajero cannot access Company 2
    const cajeroLogin = await browserApi.login("cajero", "0000");
    expect(() => browserApi.set_active_company(2, cajeroLogin.token)).toThrow(/acceso/i);
  });
});

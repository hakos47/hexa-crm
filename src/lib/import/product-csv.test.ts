import { describe, expect, it } from "vitest";
import {
  parseProductCsv,
  productCsvTemplate,
  productsToCsv,
  splitCsvLine,
} from "./product-csv";
import type { Product } from "../types";

const baseProduct = (over: Partial<Product> = {}): Product => ({
  id: 1,
  sku: "CAF-001",
  name: "Café",
  description: "",
  category: "Alimentación",
  stock: 40,
  min_stock: 10,
  cost_cents: 450,
  price_cents: 990,
  vat_rate: 10,
  active: true,
  created_at: "",
  updated_at: "",
  ...over,
});

describe("splitCsvLine", () => {
  it("handles quoted commas", () => {
    expect(splitCsvLine('a,"b,c",d')).toEqual(["a", "b,c", "d"]);
  });
});

describe("parseProductCsv", () => {
  it("parses valid rows and maps existing SKU to id", () => {
    const csv = `sku,name,price_eur,vat_rate,stock,cost_eur
CAF-001,Cafe especial,9.90,10,5,4.50
NEW-99,Nuevo,12.00,21,1,6.00
`;
    const r = parseProductCsv(csv, [baseProduct()]);
    expect(r.errors).toEqual([]);
    expect(r.ok).toBe(true);
    expect(r.would_update).toBe(1);
    expect(r.would_create).toBe(1);
    expect(r.rows[0].id).toBe(1);
    expect(r.rows[0].price_cents).toBe(990);
    expect(r.rows[0].vat_rate).toBe(10);
    expect(r.rows[1].id).toBeNull();
    expect(r.rows[1].sku).toBe("NEW-99");
    expect(r.rows[1].price_cents).toBe(1200);
  });

  it("accepts Spanish header aliases", () => {
    const csv = 'codigo,nombre,precio,iva,stock\nX1,Producto,"3,50",21,2\n';
    const r = parseProductCsv(csv, []);
    expect(r.ok).toBe(true);
    expect(r.rows[0].price_cents).toBe(350);
    expect(r.rows[0].vat_rate).toBe(21);
  });

  it("rejects invalid VAT and missing price", () => {
    const csv = `sku,name,price_eur,vat_rate
A,Item,10.00,15
B,Item2,,21
`;
    const r = parseProductCsv(csv, []);
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => /IVA/.test(e.message))).toBe(true);
    expect(r.errors.some((e) => /precio/.test(e.message))).toBe(true);
  });

  it("rejects duplicate SKU in file", () => {
    const csv = `sku,name,price_eur
A,One,1.00
A,Two,2.00
`;
    const r = parseProductCsv(csv, []);
    expect(r.ok).toBe(false);
    expect(r.errors[0].message).toMatch(/duplicado/i);
  });

  it("round-trips productsToCsv → parseProductCsv", () => {
    const products = [
      baseProduct(),
      baseProduct({ id: 2, sku: "LIB-1", name: "Libro", price_cents: 1890, vat_rate: 4 }),
    ];
    const csv = productsToCsv(products);
    const r = parseProductCsv(csv, products);
    expect(r.ok).toBe(true);
    expect(r.rows).toHaveLength(2);
    expect(r.rows[0].price_cents).toBe(990);
    expect(r.rows[1].price_cents).toBe(1890);
    expect(r.would_update).toBe(2);
  });

  it("template is importable", () => {
    const r = parseProductCsv(productCsvTemplate(), []);
    expect(r.ok).toBe(true);
    expect(r.would_create).toBe(1);
  });
});

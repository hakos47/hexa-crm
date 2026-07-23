import { describe, expect, it } from "vitest";
import { planReorderSuggestions } from "./reorder";

const products = [
  { id: 1, sku: "A", name: "Rápido", stock: 2, min_stock: 5, active: true },
  { id: 2, sku: "B", name: "Sano", stock: 40, min_stock: 5, active: true },
] as any;

describe("planReorderSuggestions", () => {
  it("prioritizes critical stock and covers the target period", () => {
    const suggestions = planReorderSuggestions(products, { 1: 14, 2: 1 }, 14, 21);
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0]).toMatchObject({ product_id: 1, priority: "critical", qty_suggested: 19 });
  });

  it("does not suggest inactive or healthy products", () => {
    expect(planReorderSuggestions([...products, { ...products[0], id: 3, active: false }], { 3: 100 })).toHaveLength(1);
  });
});

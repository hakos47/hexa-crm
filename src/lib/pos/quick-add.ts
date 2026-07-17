/**
 * POS barcode-style quick add: exact SKU first, else sole search match.
 */

export type QuickAddProduct = {
  id: number;
  sku: string;
  name: string;
  stock: number;
  active: boolean;
};

export type QuickAddResult =
  | { kind: "exact_sku"; product: QuickAddProduct }
  | { kind: "sole_match"; product: QuickAddProduct }
  | { kind: "ambiguous"; count: number }
  | { kind: "none" };

export function resolveQuickAdd(
  query: string,
  products: QuickAddProduct[]
): QuickAddResult {
  const q = query.trim().toLowerCase();
  if (!q) return { kind: "none" };

  const sellable = products.filter((p) => p.active && p.stock > 0);

  const exact = sellable.find((p) => p.sku.toLowerCase() === q);
  if (exact) return { kind: "exact_sku", product: exact };

  const matches = sellable.filter(
    (p) =>
      p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q)
  );
  if (matches.length === 1) return { kind: "sole_match", product: matches[0]! };
  if (matches.length === 0) return { kind: "none" };
  return { kind: "ambiguous", count: matches.length };
}

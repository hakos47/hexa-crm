/** CSV helpers for accounting handoff (sales + VAT book). */

export function escapeCsvCell(value: string | number | null | undefined): string {
  const s = value == null ? "" : String(value);
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function toCsv(rows: (string | number | null | undefined)[][]): string {
  return rows.map((row) => row.map(escapeCsvCell).join(",")).join("\n") + "\n";
}

export type SaleCsvRow = {
  number: string;
  sold_at: string;
  customer_name?: string | null;
  subtotal_cents: number;
  vat_cents: number;
  total_cents: number;
  status: string;
};

export function salesToCsv(sales: SaleCsvRow[]): string {
  const header = [
    "ticket",
    "fecha",
    "cliente",
    "base_eur",
    "iva_eur",
    "total_eur",
    "estado",
  ];
  const body = sales.map((s) => [
    s.number,
    s.sold_at,
    s.customer_name ?? "",
    (s.subtotal_cents / 100).toFixed(2),
    (s.vat_cents / 100).toFixed(2),
    (s.total_cents / 100).toFixed(2),
    s.status,
  ]);
  return toCsv([header, ...body]);
}

export type VatCsvBucket = {
  vat_rate: number;
  base_cents: number;
  vat_cents: number;
  total_cents: number;
};

export function vatSummaryToCsv(
  from: string,
  to: string,
  buckets: VatCsvBucket[]
): string {
  const header = ["desde", "hasta", "tipo_iva", "base_eur", "cuota_eur", "total_eur"];
  const body = buckets.map((b) => [
    from,
    to,
    b.vat_rate,
    (b.base_cents / 100).toFixed(2),
    (b.vat_cents / 100).toFixed(2),
    (b.total_cents / 100).toFixed(2),
  ]);
  return toCsv([header, ...body]);
}

/** Trigger browser download of a CSV string. */
export function downloadCsv(filename: string, csv: string): void {
  if (typeof document === "undefined") return;
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function reorderSuggestionsToCsv(
  suggestions: { sku: string; name: string; stock: number; min_stock: number; qty_suggested: number }[],
): string {
  return toCsv([
    ["sku", "producto", "stock_actual", "stock_minimo", "cantidad_sugerida"],
    ...suggestions.map((s) => [s.sku, s.name, s.stock, s.min_stock, s.qty_suggested]),
  ]);
}

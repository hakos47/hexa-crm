/**
 * Product catalog CSV import/export — pure helpers (ciclo 4).
 * Headers are stable Spanish/English aliases for retail onboarding.
 */
import type { Product, ProductInput } from "../types";
import { isVatRate, type VatRate } from "../vat";
import { toCsv } from "../export/csv";

export const PRODUCT_CSV_HEADERS = [
  "sku",
  "name",
  "description",
  "category",
  "stock",
  "min_stock",
  "cost_eur",
  "price_eur",
  "vat_rate",
  "active",
] as const;

export type ProductCsvRowError = {
  line: number;
  message: string;
};

export type ProductCsvParseResult = {
  ok: boolean;
  rows: ProductInput[];
  errors: ProductCsvRowError[];
  /** How many rows had a matching existing SKU (would update). */
  would_update: number;
  would_create: number;
};

/** Minimal RFC4180-ish CSV line split (quoted commas, ""). */
export function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out.map((c) => c.trim());
}

export function parseCsvText(text: string): string[][] {
  const normalized = text.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = normalized.split("\n").filter((l) => l.trim().length > 0);
  return lines.map(splitCsvLine);
}

function normalizeHeader(h: string): string {
  return h
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[áà]/g, "a")
    .replace(/[éè]/g, "e")
    .replace(/[íì]/g, "i")
    .replace(/[óò]/g, "o")
    .replace(/[úù]/g, "u");
}

/** Map common aliases → canonical header. */
const HEADER_ALIASES: Record<string, (typeof PRODUCT_CSV_HEADERS)[number]> = {
  sku: "sku",
  codigo: "sku",
  code: "sku",
  name: "name",
  nombre: "name",
  producto: "name",
  description: "description",
  descripcion: "description",
  category: "category",
  categoria: "category",
  stock: "stock",
  existencias: "stock",
  min_stock: "min_stock",
  stock_minimo: "min_stock",
  minimo: "min_stock",
  cost_eur: "cost_eur",
  coste_eur: "cost_eur",
  coste: "cost_eur",
  cost: "cost_eur",
  price_eur: "price_eur",
  pvp_eur: "price_eur",
  pvp: "price_eur",
  precio: "price_eur",
  price: "price_eur",
  vat_rate: "vat_rate",
  iva: "vat_rate",
  tipo_iva: "vat_rate",
  active: "active",
  activo: "active",
};

function eurosToCents(raw: string): number | null {
  const s = raw.trim().replace(/\s/g, "").replace(",", ".");
  if (!s) return null;
  const n = Number(s);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

function parseActive(raw: string): boolean {
  const s = raw.trim().toLowerCase();
  if (!s) return true;
  if (["0", "false", "no", "n", "inactivo", "inactive"].includes(s)) return false;
  return true;
}

/**
 * Parse product CSV text into ProductInput rows.
 * Existing products by SKU (case-insensitive) get `id` set for upsert.
 */
export function parseProductCsv(
  text: string,
  existing: Pick<Product, "id" | "sku">[] = [],
): ProductCsvParseResult {
  const errors: ProductCsvRowError[] = [];
  const matrix = parseCsvText(text);
  if (matrix.length === 0) {
    return {
      ok: false,
      rows: [],
      errors: [{ line: 0, message: "CSV vacío" }],
      would_update: 0,
      would_create: 0,
    };
  }

  const headerCells = matrix[0].map(normalizeHeader);
  const colIndex = new Map<string, number>();
  headerCells.forEach((h, i) => {
    const canon = HEADER_ALIASES[h];
    if (canon) colIndex.set(canon, i);
  });

  if (!colIndex.has("sku") || !colIndex.has("name") || !colIndex.has("price_eur")) {
    return {
      ok: false,
      rows: [],
      errors: [
        {
          line: 1,
          message:
            "Cabecera incompleta: se requieren al menos columnas sku, name (o nombre) y price_eur (o pvp/precio).",
        },
      ],
      would_update: 0,
      would_create: 0,
    };
  }

  const skuToId = new Map(
    existing.map((p) => [p.sku.trim().toLowerCase(), p.id] as const),
  );
  const rows: ProductInput[] = [];
  let would_update = 0;
  let would_create = 0;
  const seenSku = new Set<string>();

  for (let r = 1; r < matrix.length; r++) {
    const lineNo = r + 1;
    const cells = matrix[r];
    const get = (key: (typeof PRODUCT_CSV_HEADERS)[number]) => {
      const idx = colIndex.get(key);
      return idx == null ? "" : (cells[idx] ?? "");
    };

    const sku = get("sku").trim();
    const name = get("name").trim();
    if (!sku && !name) continue; // blank line
    if (!sku) {
      errors.push({ line: lineNo, message: "SKU obligatorio" });
      continue;
    }
    if (!name) {
      errors.push({ line: lineNo, message: `Fila ${sku}: nombre obligatorio` });
      continue;
    }
    const skuKey = sku.toLowerCase();
    if (seenSku.has(skuKey)) {
      errors.push({ line: lineNo, message: `SKU duplicado en archivo: ${sku}` });
      continue;
    }
    seenSku.add(skuKey);

    const price = eurosToCents(get("price_eur"));
    if (price == null) {
      errors.push({ line: lineNo, message: `Fila ${sku}: precio (price_eur) no válido` });
      continue;
    }
    const costRaw = get("cost_eur");
    const cost = costRaw.trim() === "" ? 0 : eurosToCents(costRaw);
    if (cost == null) {
      errors.push({ line: lineNo, message: `Fila ${sku}: coste no válido` });
      continue;
    }

    const vatRaw = get("vat_rate").trim() || "21";
    const vatNum = Number(vatRaw.replace(",", "."));
    if (!isVatRate(vatNum)) {
      errors.push({
        line: lineNo,
        message: `Fila ${sku}: IVA debe ser 0, 4, 10 o 21 (recibido: ${vatRaw})`,
      });
      continue;
    }
    const vat_rate = vatNum as VatRate;

    const stock = get("stock").trim() === "" ? 0 : Number(get("stock").replace(",", "."));
    const min_stock =
      get("min_stock").trim() === "" ? 0 : Number(get("min_stock").replace(",", "."));
    if (!Number.isFinite(stock) || stock < 0 || !Number.isInteger(stock)) {
      errors.push({ line: lineNo, message: `Fila ${sku}: stock debe ser entero ≥ 0` });
      continue;
    }
    if (!Number.isFinite(min_stock) || min_stock < 0 || !Number.isInteger(min_stock)) {
      errors.push({ line: lineNo, message: `Fila ${sku}: min_stock debe ser entero ≥ 0` });
      continue;
    }

    const existingId = skuToId.get(skuKey);
    if (existingId != null) would_update += 1;
    else would_create += 1;

    rows.push({
      id: existingId ?? null,
      sku,
      name,
      description: get("description"),
      category: get("category"),
      stock,
      min_stock,
      cost_cents: cost,
      price_cents: price,
      vat_rate,
      active: parseActive(get("active")),
    });
  }

  return {
    ok: errors.length === 0 && rows.length > 0,
    rows,
    errors,
    would_update,
    would_create,
  };
}

/** Template / export of current catalog for round-trip. */
export function productsToCsv(products: Product[]): string {
  const header = [...PRODUCT_CSV_HEADERS];
  const body = products.map((p) => [
    p.sku,
    p.name,
    p.description ?? "",
    p.category ?? "",
    p.stock,
    p.min_stock,
    (p.cost_cents / 100).toFixed(2),
    (p.price_cents / 100).toFixed(2),
    p.vat_rate,
    p.active ? "1" : "0",
  ]);
  return toCsv([header, ...body]);
}

export function productCsvTemplate(): string {
  return toCsv([
    [...PRODUCT_CSV_HEADERS],
    ["DEMO-001", "Producto ejemplo", "Descripción", "General", "10", "2", "1.00", "2.42", "21", "1"],
  ]);
}

/** Spanish VAT (IVA) helpers. PVP is tax-inclusive. */

export const VAT_RATES = [0, 4, 10, 21] as const;
export type VatRate = (typeof VAT_RATES)[number];

export function isVatRate(n: number): n is VatRate {
  return (VAT_RATES as readonly number[]).includes(n);
}

export function vatLabel(rate: VatRate): string {
  switch (rate) {
    case 21:
      return "General 21%";
    case 10:
      return "Reducido 10%";
    case 4:
      return "Superreducido 4%";
    case 0:
      return "Exento 0%";
  }
}

/** Split tax-inclusive total into base + VAT (cents, integer-safe). */
export function splitInclusive(totalCents: number, rate: VatRate): {
  baseCents: number;
  vatCents: number;
  totalCents: number;
} {
  if (rate === 0) {
    return { baseCents: totalCents, vatCents: 0, totalCents };
  }
  const baseCents = Math.round(totalCents / (1 + rate / 100));
  const vatCents = totalCents - baseCents;
  return { baseCents, vatCents, totalCents };
}

export type LineInput = {
  qty: number;
  unitPriceCents: number;
  vatRate: VatRate;
  discountCents?: number;
};

export type LineBreakdown = {
  qty: number;
  unitPriceCents: number;
  vatRate: VatRate;
  lineTotalCents: number;
  lineBaseCents: number;
  lineVatCents: number;
};

export function lineBreakdown(line: LineInput): LineBreakdown {
  const discount = line.discountCents ?? 0;
  const lineTotalCents = Math.max(0, line.unitPriceCents * line.qty - discount);
  const { baseCents, vatCents } = splitInclusive(lineTotalCents, line.vatRate);
  return {
    qty: line.qty,
    unitPriceCents: line.unitPriceCents,
    vatRate: line.vatRate,
    lineTotalCents,
    lineBaseCents: baseCents,
    lineVatCents: vatCents,
  };
}

export type SaleTotals = {
  subtotalCents: number;
  vatCents: number;
  totalCents: number;
  byRate: Record<VatRate, { baseCents: number; vatCents: number; totalCents: number }>;
};

export function saleTotals(lines: LineInput[]): SaleTotals {
  const byRate: SaleTotals["byRate"] = {
    0: { baseCents: 0, vatCents: 0, totalCents: 0 },
    4: { baseCents: 0, vatCents: 0, totalCents: 0 },
    10: { baseCents: 0, vatCents: 0, totalCents: 0 },
    21: { baseCents: 0, vatCents: 0, totalCents: 0 },
  };

  let subtotalCents = 0;
  let vatCents = 0;
  let totalCents = 0;

  for (const line of lines) {
    const b = lineBreakdown(line);
    subtotalCents += b.lineBaseCents;
    vatCents += b.lineVatCents;
    totalCents += b.lineTotalCents;
    byRate[b.vatRate].baseCents += b.lineBaseCents;
    byRate[b.vatRate].vatCents += b.lineVatCents;
    byRate[b.vatRate].totalCents += b.lineTotalCents;
  }

  return { subtotalCents, vatCents, totalCents, byRate };
}

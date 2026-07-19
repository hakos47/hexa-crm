/**
 * End-of-day cash close report — POS best practice for small retail.
 * Ciclo 9: includes partially_returned; nets display sales; cash uses gross − refunds-as-expense.
 */

export type DailyCloseSale = {
  sold_at: string;
  total_cents: number;
  subtotal_cents: number;
  vat_cents: number;
  /** Cumulative refunds (partial returns). */
  refunded_cents?: number;
  status?: string;
};

export type DailyCloseCash = {
  kind: "income" | "expense" | "adjustment" | string;
  amount_cents: number;
  occurred_at: string;
  sale_id?: number | null;
  category?: string;
};

export type DailyCloseReport = {
  day: string;
  sales_count: number;
  /** Gross ticket totals (pre-refund) for cash equation. */
  sales_gross_cents: number;
  /** Net sales after refunds (display / business). */
  sales_total_cents: number;
  sales_base_cents: number;
  sales_vat_cents: number;
  /** Cash income not tied to a sale (manual). */
  other_income_cents: number;
  expense_cents: number;
  adjustment_cents: number;
  /**
   * Net cash movement for the day:
   * gross sales + other income − expenses + adjustments
   * (refunds are expenses, so do not also net sales here).
   */
  net_cash_cents: number;
  /** Running balance provided by caller (current till). */
  cash_balance_cents: number;
};

function dayKey(iso: string): string {
  return iso.slice(0, 10);
}

/** Sales that still contribute to business totals for the day. */
export function saleCountsInDailyClose(status: string | undefined): boolean {
  if (!status) return true; // legacy fixtures without status
  return status === "completed" || status === "partially_returned";
}

export function netSaleCents(sale: {
  total_cents: number;
  refunded_cents?: number;
  status?: string;
}): number {
  if (sale.status === "cancelled") return 0;
  return Math.max(0, sale.total_cents - (sale.refunded_cents ?? 0));
}

/**
 * Approximate remaining base/VAT after refunds using total ratio.
 */
export function netTaxParts(
  subtotal_cents: number,
  vat_cents: number,
  total_cents: number,
  refunded_cents: number,
): { base: number; vat: number } {
  const net = Math.max(0, total_cents - refunded_cents);
  if (total_cents <= 0 || net === total_cents) {
    return { base: subtotal_cents, vat: vat_cents };
  }
  if (net === 0) return { base: 0, vat: 0 };
  const base = Math.round((subtotal_cents * net) / total_cents);
  const vat = net - base;
  return { base, vat };
}

export function buildDailyCloseReport(
  day: string,
  sales: DailyCloseSale[],
  cash: DailyCloseCash[],
  cashBalanceCents: number,
): DailyCloseReport {
  let sales_count = 0;
  let sales_gross_cents = 0;
  let sales_total_cents = 0;
  let sales_base_cents = 0;
  let sales_vat_cents = 0;

  for (const s of sales) {
    if (dayKey(s.sold_at) !== day) continue;
    if (!saleCountsInDailyClose(s.status)) continue;
    const refunded = s.refunded_cents ?? 0;
    const net = netSaleCents(s);
    sales_count += 1;
    sales_gross_cents += s.total_cents;
    sales_total_cents += net;
    const parts = netTaxParts(s.subtotal_cents, s.vat_cents, s.total_cents, refunded);
    sales_base_cents += parts.base;
    sales_vat_cents += parts.vat;
  }

  let other_income_cents = 0;
  let expense_cents = 0;
  let adjustment_cents = 0;

  for (const m of cash) {
    if (dayKey(m.occurred_at) !== day) continue;
    const amt = Math.abs(m.amount_cents);
    if (m.kind === "expense") {
      expense_cents += amt;
    } else if (m.kind === "adjustment") {
      adjustment_cents += amt;
    } else if (m.kind === "income") {
      // sale-linked incomes are already in sales_gross; count only manual
      if (m.sale_id == null) other_income_cents += amt;
    }
  }

  // Gross sales + manual income − all expenses (incl. refunds) + adjustments
  const net_cash_cents =
    sales_gross_cents + other_income_cents - expense_cents + adjustment_cents;

  return {
    day,
    sales_count,
    sales_gross_cents,
    sales_total_cents,
    sales_base_cents,
    sales_vat_cents,
    other_income_cents,
    expense_cents,
    adjustment_cents,
    net_cash_cents,
    cash_balance_cents: cashBalanceCents,
  };
}

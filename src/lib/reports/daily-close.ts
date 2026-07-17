/**
 * End-of-day cash close report — POS best practice for small retail.
 */

export type DailyCloseSale = {
  sold_at: string;
  total_cents: number;
  subtotal_cents: number;
  vat_cents: number;
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
  sales_total_cents: number;
  sales_base_cents: number;
  sales_vat_cents: number;
  /** Cash income not tied to a sale (manual). */
  other_income_cents: number;
  expense_cents: number;
  adjustment_cents: number;
  /** Net cash movement for the day (sales income + other - expenses + adjustments). */
  net_cash_cents: number;
  /** Running balance provided by caller (current till). */
  cash_balance_cents: number;
};

function dayKey(iso: string): string {
  return iso.slice(0, 10);
}

export function buildDailyCloseReport(
  day: string,
  sales: DailyCloseSale[],
  cash: DailyCloseCash[],
  cashBalanceCents: number
): DailyCloseReport {
  let sales_count = 0;
  let sales_total_cents = 0;
  let sales_base_cents = 0;
  let sales_vat_cents = 0;

  for (const s of sales) {
    if (dayKey(s.sold_at) !== day) continue;
    sales_count += 1;
    sales_total_cents += s.total_cents;
    sales_base_cents += s.subtotal_cents;
    sales_vat_cents += s.vat_cents;
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
      // sale-linked incomes are already in sales_total; count only manual
      if (m.sale_id == null) other_income_cents += amt;
    }
  }

  const net_cash_cents =
    sales_total_cents + other_income_cents - expense_cents + adjustment_cents;

  return {
    day,
    sales_count,
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

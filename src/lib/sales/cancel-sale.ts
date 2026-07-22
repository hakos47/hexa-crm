/**
 * Sale void/cancel rules — full ticket void (not partial return).
 * Status transitions: completed → cancelled only.
 */

export type CancelableSale = {
  id: number;
  number: string;
  status: string;
  total_cents: number;
};

export type CancelSaleLine = {
  product_id: number;
  qty: number;
};

export type CancelSalePlan = {
  sale_id: number;
  number: string;
  stock_restores: { product_id: number; qty: number }[];
  cash_expense_cents: number;
  cash_category: string;
  cash_description: string;
  new_status: "cancelled";
};

export function canCancelSale(sale: CancelableSale): string | null {
  if (sale.status === "cancelled") {
    return "La venta ya está anulada";
  }
  if (sale.status !== "completed") {
    return `No se puede anular una venta en estado "${sale.status}"`;
  }
  return null;
}

/**
 * Build the side-effects plan for voiding a completed sale.
 * Does not mutate storage — caller applies the plan.
 */
export function planCancelSale(
  sale: CancelableSale,
  lines: CancelSaleLine[]
): CancelSalePlan {
  const err = canCancelSale(sale);
  if (err) throw new Error(err);
  if (!lines.length) throw new Error("La venta no tiene líneas para restaurar");

  return {
    sale_id: sale.id,
    number: sale.number,
    stock_restores: lines.map((l) => ({
      product_id: l.product_id,
      qty: l.qty,
    })),
    cash_expense_cents: Math.abs(sale.total_cents),
    cash_category: "anulaciones",
    cash_description: `Anulación ${sale.number}`,
    new_status: "cancelled",
  };
}

/**
 * Whether aggregates (dashboard, IVA) should include this sale.
 * Partial returns stay counted; net amounts use refunded_cents / remaining qty.
 */
export function countsInBusinessTotals(status: string): boolean {
  return status === "completed" || status === "partially_returned";
}

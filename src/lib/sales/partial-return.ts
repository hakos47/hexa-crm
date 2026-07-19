/**
 * Partial line returns (ciclo 8 / B6).
 * Pure planner — no I/O. Callers apply stock, cash and returned_qty.
 *
 * Money is tax-inclusive cents; refund per line is proportional to qty returned
 * with remainder cents assigned to the last unit of each line request so
 * Σ refunds for full line = line_total_cents.
 */

export type ReturnableSale = {
  id: number;
  number: string;
  status: string;
  total_cents: number;
  /** Cumulative refunds already applied (cents). */
  refunded_cents?: number;
};

export type ReturnableLine = {
  id: number;
  product_id: number;
  qty: number;
  /** Units already returned (default 0). */
  returned_qty?: number;
  line_total_cents: number;
  line_base_cents: number;
  line_vat_cents: number;
};

export type ReturnLineRequest = {
  line_id: number;
  qty: number;
};

export type PartialReturnLinePlan = {
  line_id: number;
  product_id: number;
  qty: number;
  refund_total_cents: number;
  refund_base_cents: number;
  refund_vat_cents: number;
  new_returned_qty: number;
};

export type PartialReturnPlan = {
  sale_id: number;
  number: string;
  lines: PartialReturnLinePlan[];
  cash_expense_cents: number;
  cash_category: "devoluciones";
  cash_description: string;
  stock_restores: { product_id: number; qty: number }[];
  new_refunded_cents: number;
  /** completed | partially_returned | cancelled (all units back) */
  new_status: "completed" | "partially_returned" | "cancelled";
};

export function remainingQty(line: ReturnableLine): number {
  const ret = line.returned_qty ?? 0;
  return Math.max(0, line.qty - ret);
}

/**
 * Proportional cents for `take` units of `totalUnits` sharing `totalCents`.
 * Uses floor per unit then remainder on the last taken unit of this request.
 */
export function proportionalCents(
  totalCents: number,
  totalUnits: number,
  alreadyTaken: number,
  take: number,
): number {
  if (take <= 0 || totalUnits <= 0) return 0;
  if (alreadyTaken + take >= totalUnits) {
    // Remainder path: everything not yet allocated
    const prev = proportionalCents(totalCents, totalUnits, 0, alreadyTaken);
    return Math.max(0, totalCents - prev);
  }
  const per = Math.floor(totalCents / totalUnits);
  return per * take;
}

export function canReturnLines(
  sale: ReturnableSale,
  lines: ReturnableLine[],
  requests: ReturnLineRequest[],
): string | null {
  if (sale.status === "cancelled") {
    return "La venta ya está anulada";
  }
  if (sale.status !== "completed" && sale.status !== "partially_returned") {
    return `No se puede devolver una venta en estado "${sale.status}"`;
  }
  if (!requests.length) {
    return "Indica al menos una línea y cantidad a devolver";
  }
  const byId = new Map(lines.map((l) => [l.id, l]));
  const seen = new Set<number>();
  for (const req of requests) {
    if (seen.has(req.line_id)) {
      return "Línea duplicada en la solicitud de devolución";
    }
    seen.add(req.line_id);
    if (!Number.isInteger(req.qty) || req.qty <= 0) {
      return "La cantidad a devolver debe ser un entero positivo";
    }
    const line = byId.get(req.line_id);
    if (!line) {
      return `Línea ${req.line_id} no pertenece a esta venta`;
    }
    const rem = remainingQty(line);
    if (req.qty > rem) {
      return `Solo quedan ${rem} ud. por devolver en la línea ${req.line_id}`;
    }
  }
  return null;
}

export function planPartialReturn(
  sale: ReturnableSale,
  lines: ReturnableLine[],
  requests: ReturnLineRequest[],
): PartialReturnPlan {
  const err = canReturnLines(sale, lines, requests);
  if (err) throw new Error(err);

  const byId = new Map(lines.map((l) => [l.id, l]));
  const planned: PartialReturnLinePlan[] = [];
  let cash = 0;

  for (const req of requests) {
    const line = byId.get(req.line_id)!;
    const already = line.returned_qty ?? 0;
    const refundTotal = proportionalCents(
      line.line_total_cents,
      line.qty,
      already,
      req.qty,
    );
    const refundBase = proportionalCents(
      line.line_base_cents,
      line.qty,
      already,
      req.qty,
    );
    let refundVat = proportionalCents(
      line.line_vat_cents,
      line.qty,
      already,
      req.qty,
    );
    // Keep base+vat coherent with total (adjust VAT remainder)
    if (refundBase + refundVat !== refundTotal) {
      refundVat = refundTotal - refundBase;
    }
    planned.push({
      line_id: line.id,
      product_id: line.product_id,
      qty: req.qty,
      refund_total_cents: refundTotal,
      refund_base_cents: refundBase,
      refund_vat_cents: refundVat,
      new_returned_qty: already + req.qty,
    });
    cash += refundTotal;
  }

  // Project final returned state for status
  const nextReturned = new Map(
    lines.map((l) => [l.id, l.returned_qty ?? 0] as const),
  );
  for (const p of planned) {
    nextReturned.set(p.line_id, p.new_returned_qty);
  }
  const allBack = lines.every((l) => (nextReturned.get(l.id) ?? 0) >= l.qty);
  const anyBack = lines.some((l) => (nextReturned.get(l.id) ?? 0) > 0);

  let new_status: PartialReturnPlan["new_status"] = "completed";
  if (allBack) new_status = "cancelled";
  else if (anyBack) new_status = "partially_returned";

  const prevRefunded = sale.refunded_cents ?? 0;
  const new_refunded_cents = prevRefunded + cash;

  // Aggregate stock by product
  const stockMap = new Map<number, number>();
  for (const p of planned) {
    stockMap.set(p.product_id, (stockMap.get(p.product_id) ?? 0) + p.qty);
  }

  return {
    sale_id: sale.id,
    number: sale.number,
    lines: planned,
    cash_expense_cents: cash,
    cash_category: "devoluciones",
    cash_description: allBack
      ? `Devolución total ${sale.number}`
      : `Devolución parcial ${sale.number}`,
    stock_restores: [...stockMap.entries()].map(([product_id, qty]) => ({
      product_id,
      qty,
    })),
    new_refunded_cents,
    new_status,
  };
}

/** Net revenue still counted for dashboard after refunds. */
export function netSaleTotalCents(sale: {
  total_cents: number;
  refunded_cents?: number;
  status: string;
}): number {
  if (sale.status === "cancelled") return 0;
  return Math.max(0, sale.total_cents - (sale.refunded_cents ?? 0));
}

/** Remaining line economics after returns (for IVA net). */
export function remainingLineAmounts(line: ReturnableLine): {
  base_cents: number;
  vat_cents: number;
  total_cents: number;
  remaining_qty: number;
} {
  const rem = remainingQty(line);
  if (rem <= 0) {
    return { base_cents: 0, vat_cents: 0, total_cents: 0, remaining_qty: 0 };
  }
  if (rem === line.qty) {
    return {
      base_cents: line.line_base_cents,
      vat_cents: line.line_vat_cents,
      total_cents: line.line_total_cents,
      remaining_qty: rem,
    };
  }
  const returned = line.returned_qty ?? 0;
  const totalBack = proportionalCents(line.line_total_cents, line.qty, 0, returned);
  const baseBack = proportionalCents(line.line_base_cents, line.qty, 0, returned);
  let vatBack = proportionalCents(line.line_vat_cents, line.qty, 0, returned);
  if (baseBack + vatBack !== totalBack) vatBack = totalBack - baseBack;
  return {
    base_cents: line.line_base_cents - baseBack,
    vat_cents: line.line_vat_cents - vatBack,
    total_cents: line.line_total_cents - totalBack,
    remaining_qty: rem,
  };
}

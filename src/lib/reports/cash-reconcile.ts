/**
 * Cash drawer reconciliation (arqueo) — ciclo 9 / B8.
 * Pure: expected system balance vs physical count → descuadre.
 */

export type CashReconcileInput = {
  /** System till balance (cents). */
  expected_cents: number;
  /** Physical count entered by cashier (cents). */
  counted_cents: number;
};

export type CashReconcileResult = {
  expected_cents: number;
  counted_cents: number;
  /** counted − expected (positive = sobrante, negative = faltante). */
  difference_cents: number;
  balanced: boolean;
  /** Human label ES */
  outcome: "cuadrado" | "sobrante" | "faltante";
  /**
   * Suggested cash movement to post so system matches count:
   * adjustment (+) for sobrante, expense for faltante (or negative adjustment).
   */
  suggested_adjustment: {
    kind: "adjustment" | "expense";
    amount_cents: number;
    category: "arqueo";
    description: string;
  } | null;
};

export function planCashReconcile(input: CashReconcileInput): CashReconcileResult {
  const expected = Math.trunc(input.expected_cents);
  const counted = Math.trunc(input.counted_cents);
  if (!Number.isFinite(expected) || !Number.isFinite(counted)) {
    throw new Error("Importes de arqueo no válidos");
  }
  if (counted < 0) {
    throw new Error("El contado físico no puede ser negativo");
  }

  const difference_cents = counted - expected;
  let outcome: CashReconcileResult["outcome"] = "cuadrado";
  if (difference_cents > 0) outcome = "sobrante";
  else if (difference_cents < 0) outcome = "faltante";

  let suggested_adjustment: CashReconcileResult["suggested_adjustment"] = null;
  if (difference_cents > 0) {
    suggested_adjustment = {
      kind: "adjustment",
      amount_cents: difference_cents,
      category: "arqueo",
      description: `Arqueo: sobrante ${difference_cents} céntimos`,
    };
  } else if (difference_cents < 0) {
    suggested_adjustment = {
      kind: "expense",
      amount_cents: Math.abs(difference_cents),
      category: "arqueo",
      description: `Arqueo: faltante ${Math.abs(difference_cents)} céntimos`,
    };
  }

  return {
    expected_cents: expected,
    counted_cents: counted,
    difference_cents,
    balanced: difference_cents === 0,
    outcome,
    suggested_adjustment,
  };
}

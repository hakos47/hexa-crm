import { describe, expect, it } from "vitest";
import { planCashReconcile } from "./cash-reconcile";

describe("planCashReconcile", () => {
  it("reports balanced when count matches system", () => {
    const r = planCashReconcile({ expected_cents: 12500, counted_cents: 12500 });
    expect(r.balanced).toBe(true);
    expect(r.outcome).toBe("cuadrado");
    expect(r.difference_cents).toBe(0);
    expect(r.suggested_adjustment).toBeNull();
  });

  it("plans adjustment for sobrante", () => {
    const r = planCashReconcile({ expected_cents: 10000, counted_cents: 10550 });
    expect(r.outcome).toBe("sobrante");
    expect(r.difference_cents).toBe(550);
    expect(r.suggested_adjustment).toEqual({
      kind: "adjustment",
      amount_cents: 550,
      category: "arqueo",
      description: expect.stringMatching(/sobrante/i),
    });
  });

  it("plans expense for faltante", () => {
    const r = planCashReconcile({ expected_cents: 10000, counted_cents: 9800 });
    expect(r.outcome).toBe("faltante");
    expect(r.difference_cents).toBe(-200);
    expect(r.suggested_adjustment?.kind).toBe("expense");
    expect(r.suggested_adjustment?.amount_cents).toBe(200);
    expect(r.suggested_adjustment?.category).toBe("arqueo");
  });

  it("rejects negative counted", () => {
    expect(() => planCashReconcile({ expected_cents: 100, counted_cents: -1 })).toThrow(
      /negativo/i,
    );
  });
});

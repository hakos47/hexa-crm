import { describe, expect, it } from "vitest";
import { escapeCsvCell, salesToCsv, toCsv, vatSummaryToCsv } from "./csv";

describe("csv export", () => {
  it("escapes commas and quotes", () => {
    expect(escapeCsvCell('a,"b"')).toBe('"a,""b"""');
    expect(escapeCsvCell("simple")).toBe("simple");
  });

  it("builds sales CSV with euro amounts from cents", () => {
    const csv = salesToCsv([
      {
        number: "T-00001",
        sold_at: "2026-07-18T10:00:00.000Z",
        customer_name: "Ana",
        subtotal_cents: 10000,
        vat_cents: 2100,
        total_cents: 12100,
        status: "completed",
      },
    ]);
    expect(csv).toContain("ticket,fecha,cliente");
    expect(csv).toContain("T-00001");
    expect(csv).toContain("100.00");
    expect(csv).toContain("21.00");
    expect(csv).toContain("121.00");
  });

  it("builds VAT summary CSV by rate", () => {
    const csv = vatSummaryToCsv("2026-07-01", "2026-07-31", [
      { vat_rate: 21, base_cents: 10000, vat_cents: 2100, total_cents: 12100 },
      { vat_rate: 10, base_cents: 5000, vat_cents: 500, total_cents: 5500 },
    ]);
    const lines = csv.trim().split("\n");
    expect(lines[0]).toContain("tipo_iva");
    expect(lines.length).toBe(3);
    expect(csv).toContain("21");
    expect(csv).toContain("10");
  });

  it("toCsv ends with newline", () => {
    expect(toCsv([["a", "b"]]).endsWith("\n")).toBe(true);
  });
});

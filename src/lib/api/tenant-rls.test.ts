import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";

describe("tenant RLS schema", () => {
  it("enables policies for commercial tables", async () => {
    const source = await readFile(new URL("./postgres-db.ts", import.meta.url), "utf8");
    for (const table of ["products", "customers", "sales", "cash_movements", "reservations", "semantic_documents"]) {
      expect(source).toContain(`"${table}"`);
    }
    expect(source).toContain("ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY");
    expect(source).toContain("app.company_id");
  });
});

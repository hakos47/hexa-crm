import { describe, expect, it } from "vitest";

describe("central deployment contract", () => {
  it("documents an explicit central mode instead of seeding demo data", async () => {
    const source = await import("node:fs/promises").then((fs) => fs.readFile(new URL("./postgres-db.ts", import.meta.url), "utf8"));
    expect(source).toContain("HEXA_CENTRAL_MODE");
    expect(source).toContain("if (!CENTRAL_MODE)");
  });
});

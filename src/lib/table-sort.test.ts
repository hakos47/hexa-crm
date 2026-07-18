import { describe, expect, it } from "vitest";
import { nextSortDirection, sortRows } from "./table-sort";

describe("table sorting", () => {
  const rows = [
    { name: "Artículo 10", amount: 200 },
    { name: "artículo 2", amount: 100 },
    { name: "Artículo 1", amount: 100 },
  ];

  it("sorts text naturally in Spanish", () => {
    expect(sortRows(rows, "asc", (row) => row.name).map((row) => row.name)).toEqual([
      "Artículo 1",
      "artículo 2",
      "Artículo 10",
    ]);
  });

  it("sorts numbers and preserves ties", () => {
    expect(sortRows(rows, "desc", (row) => row.amount).map((row) => row.name)).toEqual([
      "Artículo 10",
      "artículo 2",
      "Artículo 1",
    ]);
  });

  it("toggles only when the active column is clicked again", () => {
    expect(nextSortDirection("name", "name", "asc")).toBe("desc");
    expect(nextSortDirection("name", "amount", "desc")).toBe("asc");
  });
});

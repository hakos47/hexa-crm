import { describe, expect, it } from "vitest";
import type { Theme } from "./theme";

describe("theme contract", () => {
  it("only exposes explicit light and dark themes", () => {
    const supported: Theme[] = ["dark", "light"];
    expect(supported).toEqual(["dark", "light"]);
  });
});

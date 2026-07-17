import { describe, expect, it } from "vitest";
import { hashPin, validatePin, verifyPin } from "./pin";

describe("PIN auth", () => {
  it("rejects short pins", () => {
    expect(validatePin("12")).toBeTruthy();
    expect(validatePin("1234")).toBeNull();
  });

  it("hashes and verifies", async () => {
    const h = await hashPin("1234");
    expect(h.startsWith("v1$")).toBe(true);
    expect(await verifyPin("1234", h)).toBe(true);
    expect(await verifyPin("0000", h)).toBe(false);
  });
});

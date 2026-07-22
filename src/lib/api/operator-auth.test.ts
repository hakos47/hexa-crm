import { describe, expect, it } from "vitest";
import { bearerToken, hashOperatorToken, newOperatorToken } from "./operator-auth";

describe("operator session tokens", () => {
  it("only accepts Bearer tokens and stores a stable hash", () => {
    expect(bearerToken("Bearer abc")).toBe("abc");
    expect(bearerToken("Basic abc")).toBeNull();
    expect(hashOperatorToken("abc")).toMatch(/^[a-f0-9]{64}$/);
    expect(newOperatorToken()).toHaveLength(64);
  });
});

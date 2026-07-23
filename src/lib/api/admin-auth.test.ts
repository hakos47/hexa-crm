import { describe, expect, it } from "vitest";
import { hasMigrationAccess } from "./admin-auth";

describe("migration administration authentication", () => {
  it("only accepts the configured bearer token", () => {
    expect(hasMigrationAccess("Bearer migrate-secret", "migrate-secret")).toBe(true);
    expect(hasMigrationAccess("Bearer wrong-secret", "migrate-secret")).toBe(false);
    expect(hasMigrationAccess(null, "migrate-secret")).toBe(false);
    expect(hasMigrationAccess("Bearer migrate-secret", undefined)).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import { centralHealthStatus } from "./central-health";

describe("centralHealthStatus", () => {
  it("distinguishes an unreachable database from pending migrations", () => {
    expect(centralHealthStatus({ databaseReachable: false, migrationsReady: false, pgvectorReady: null })).toMatchObject({ status: 503, body: { database: "unavailable", migrations: "pending" } });
    expect(centralHealthStatus({ databaseReachable: true, migrationsReady: false, pgvectorReady: true })).toMatchObject({ status: 503, body: { database: "ok", migrations: "pending" } });
  });

  it("only reports ready when schema and vector extension are ready", () => {
    expect(centralHealthStatus({ databaseReachable: true, migrationsReady: true, pgvectorReady: true })).toMatchObject({ status: 200, body: { pgvector: "ready" } });
  });
});

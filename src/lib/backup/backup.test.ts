import { describe, expect, it } from "vitest";
import {
  BACKUP_FORMAT,
  BACKUP_VERSION,
  createBackupEnvelope,
  createPreMigrationBackup,
  parseBackupJson,
  validateBackup,
} from "./backup";

const demoStore = {
  products: [{ id: 1, sku: "A", name: "Demo", stock: 5 }],
  sales: [],
  settings: { shop_name: "Demo Shop" },
};

describe("backup envelope", () => {
  it("creates versioned backup with matching checksum", async () => {
    const env = await createBackupEnvelope(demoStore);
    expect(env.format).toBe(BACKUP_FORMAT);
    expect(env.version).toBe(BACKUP_VERSION);
    expect(env.checksum).toMatch(/^[a-f0-9]{64}$/);
    const v = await validateBackup(env);
    expect(v.ok).toBe(true);
  });

  it("round-trips JSON without functional differences in payload", async () => {
    const env = await createBackupEnvelope(demoStore);
    const text = JSON.stringify(env);
    const parsed = await parseBackupJson(text);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.envelope.payload).toEqual(demoStore);
    }
  });

  it("rejects corrupted checksum", async () => {
    const env = await createBackupEnvelope(demoStore);
    env.checksum = "0".repeat(64);
    const v = await validateBackup(env);
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.error).toMatch(/checksum|corrupta/i);
  });

  it("rejects unknown format / bad JSON", async () => {
    const bad = await validateBackup({ format: "other", version: 1, checksum: "x", payload: {} });
    expect(bad.ok).toBe(false);
    const j = await parseBackupJson("not-json{");
    expect(j.ok).toBe(false);
  });

  it("pre-migration backup wraps store with reason", async () => {
    const env = await createPreMigrationBackup(demoStore, "schema v2");
    const v = await validateBackup(env);
    expect(v.ok).toBe(true);
    if (v.ok) {
      const p = v.envelope.payload as { _meta: { kind: string; reason: string }; store: unknown };
      expect(p._meta.kind).toBe("pre-migration");
      expect(p._meta.reason).toBe("schema v2");
      expect(p.store).toEqual(demoStore);
    }
  });
});

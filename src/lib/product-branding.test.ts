/**
 * Structural + behavioral checks for the hexa-crm product rename.
 * Drives real shipped modules (backup validate, store keys, product constants).
 */
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import {
  PRODUCT_NAME,
  PRODUCT_DISPLAY_NAME,
  PRODUCT_TITLE,
  PRODUCT_TAGLINE,
  PRODUCT_UPDATE_UA,
} from "./product";
import {
  BACKUP_FORMAT,
  LEGACY_BACKUP_FORMAT,
  createBackupEnvelope,
  validateBackup,
} from "./backup/backup";
import {
  __browserStoreKeyForTests,
  __legacyBrowserStoreKeysForTests,
  __resetBrowserStoreForTests,
  browserApi,
} from "./api/browser-store";

/** Minimal localStorage polyfill so load() hits the real localStorage branch. */
function installLocalStoragePolyfill() {
  const map = new Map<string, string>();
  const store = {
    getItem(k: string) {
      return map.has(k) ? map.get(k)! : null;
    },
    setItem(k: string, v: string) {
      map.set(k, String(v));
    },
    removeItem(k: string) {
      map.delete(k);
    },
    clear() {
      map.clear();
    },
    key(i: number) {
      return [...map.keys()][i] ?? null;
    },
    get length() {
      return map.size;
    },
  };
  Object.defineProperty(globalThis, "localStorage", {
    value: store,
    configurable: true,
    writable: true,
  });
  return store;
}

describe("product branding", () => {
  it("exports canonical hexa-crm package identity + commercial display", () => {
    expect(PRODUCT_NAME).toBe("hexa-crm");
    expect(PRODUCT_DISPLAY_NAME).toBe("Hexa");
    expect(PRODUCT_TITLE).toMatch(/Hexa|hexa/i);
    expect(PRODUCT_TAGLINE.toLowerCase()).toMatch(/tienda|ia local/);
    expect(PRODUCT_UPDATE_UA.toLowerCase()).toContain("hexa");
    expect(PRODUCT_NAME).not.toMatch(/nix/i);
  });

  it("writes backups under hexa-crm-backup format", async () => {
    const env = await createBackupEnvelope({ ok: true });
    expect(env.format).toBe("hexa-crm-backup");
    expect(env.format).toBe(BACKUP_FORMAT);
  });

  it("restores legacy nix-c-backup envelopes via shipped validateBackup", async () => {
    const env = await createBackupEnvelope({ products: [] });
    const legacy = { ...env, format: LEGACY_BACKUP_FORMAT };
    expect(legacy.format).toBe("nix-c-backup");
    const v = await validateBackup(legacy);
    expect(v.ok).toBe(true);
    if (v.ok) {
      expect(v.envelope.format).toBe(BACKUP_FORMAT);
      expect(v.envelope.payload).toEqual({ products: [] });
    }
  });
});

describe("browser store key rename + legacy read", () => {
  beforeEach(() => {
    installLocalStoragePolyfill();
    __resetBrowserStoreForTests();
  });

  afterEach(() => {
    __resetBrowserStoreForTests();
    // @ts-expect-error cleanup polyfill
    delete globalThis.localStorage;
  });

  it("uses hexa-crm-store-v6 as the canonical localStorage key", () => {
    expect(__browserStoreKeyForTests()).toBe("hexa-crm-store-v6");
    expect(__legacyBrowserStoreKeysForTests()).toContain("hexa-crm-store-v5");
  });

  it("loads data previously saved under nix-c-store-v5", () => {
    // Seed via the real API (writes canonical KEY through localStorage).
    const meta = browserApi.public_meta();
    expect(meta.shop_name).toBeTruthy();

    const key = __browserStoreKeyForTests();
    const raw = localStorage.getItem(key);
    expect(raw).toBeTruthy();

    // Wipe memory + storage, then re-inject only the legacy key (simulates pre-rename browser).
    __resetBrowserStoreForTests();
    localStorage.setItem("nix-c-store-v5", raw!);

    const again = browserApi.public_meta();
    expect(again.shop_name).toBe(meta.shop_name);
    // After load, data must be re-persisted under the new key.
    expect(localStorage.getItem(key)).toBeTruthy();
  });
});

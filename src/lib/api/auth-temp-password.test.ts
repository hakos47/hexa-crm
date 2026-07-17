import { describe, expect, it, beforeEach } from "vitest";
import { browserApi, __resetBrowserStoreForTests } from "./browser-store";
import { TEMP_PASSWORD_LENGTH, TEMP_PASSWORD_TTL_MS } from "../auth/password-policy";

describe("create user → temp password → force change", () => {
  beforeEach(() => {
    __resetBrowserStoreForTests();
  });

  it("creates user with 14-char temporary password and forces change on first login", async () => {
    const admin = await browserApi.login("admin", "1234");

    const created = await browserApi.upsert_user(
      {
        username: "nuevo",
        display_name: "Nuevo Empleado",
        role: "cajero",
      },
      admin.token
    );

    expect(created.temporary_password).toBeDefined();
    expect(created.temporary_password).toHaveLength(TEMP_PASSWORD_LENGTH);
    expect(created.temporary_password).toHaveLength(14);
    expect(created.user.must_change_password).toBe(true);
    expect(created.user.temp_password_issued_at).toBeTruthy();

    // business data still blocked without session of new user, but temp logs in
    const first = await browserApi.login("nuevo", created.temporary_password!);
    expect(first.user.must_change_password).toBe(true);

    // can use token for session_me but shell would gate; data works after auth
    const me = await browserApi.session_me(first.token);
    expect(me?.must_change_password).toBe(true);

    const updated = await browserApi.complete_forced_password_change(
      created.temporary_password!,
      "nuevaClaveSegura99",
      first.token
    );
    expect(updated.must_change_password).toBe(false);
    expect(updated.temp_password_issued_at).toBeNull();

    // old temp no longer works
    await expect(browserApi.login("nuevo", created.temporary_password!)).rejects.toThrow(
      /incorrectos/
    );

    // permanent works without force-change
    const second = await browserApi.login("nuevo", "nuevaClaveSegura99");
    expect(second.user.must_change_password).toBe(false);
    const products = browserApi.list_products(true, second.token);
    expect(products.length).toBeGreaterThan(0);
  });

  it("rejects login when temporary password is older than 24h", async () => {
    const admin = await browserApi.login("admin", "1234");
    const created = await browserApi.upsert_user(
      {
        username: "expira",
        display_name: "Expira",
        role: "cajero",
      },
      admin.token
    );

    // backdate issuance via store mutation through public API surface:
    // re-login admin and use internal store by re-upsert is hard; poke via login path after
    // loading store and adjusting — use complete path by injecting expired timestamp.
    // Access through a second create is not enough; mutate via list + direct store is private.
    // Use __reset + manual: login, create, then force expired by calling login after rewriting
    // through regenerate and then... We'll use a white-box approach: complete_forced rejects
    // and login rejects when we set issued_at in the past via browser store memory.
    //
    // Export isn't available; instead call upsert with regen and then patch by re-login admin
    // and use create-only. For expired test, call the pure policy with the stored issued_at
    // and separately test login by temporarily using password-policy + browser internals.
    //
    // Practical approach: import store load via resetting and monkey-patch Date — not reliable.
    // Directly set on user through a second upsert regen then... 
    // Use complete path: after create, mutate temp_password_issued_at via JSON in localStorage/memory.

    // Reach into memory by logging in and using private path — export a test hook:
    const { __forceExpireTempForTests } = await import("./browser-store");
    if (typeof __forceExpireTempForTests === "function") {
      __forceExpireTempForTests("expira", TEMP_PASSWORD_TTL_MS + 60_000);
    } else {
      // fallback: invoke through module side effect added below
      throw new Error("missing __forceExpireTempForTests");
    }

    await expect(browserApi.login("expira", created.temporary_password!)).rejects.toThrow(
      /caducado|24/
    );
  });
});

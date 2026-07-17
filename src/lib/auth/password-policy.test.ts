import { describe, expect, it } from "vitest";
import {
  TEMP_PASSWORD_LENGTH,
  TEMP_PASSWORD_TTL_MS,
  clearTempCredentialFields,
  generateTempPassword,
  isTempPasswordExpired,
  issueTempCredentialFields,
  mustForcePasswordChange,
  shouldRejectExpiredTemp,
  validatePermanentPassword,
} from "./password-policy";

describe("generateTempPassword", () => {
  it("returns exactly 14 characters", () => {
    const pw = generateTempPassword();
    expect(pw).toHaveLength(TEMP_PASSWORD_LENGTH);
    expect(pw).toHaveLength(14);
  });

  it("uses only charset characters", () => {
    const pw = generateTempPassword();
    expect(pw).toMatch(/^[A-Za-z0-9]+$/);
    // no ambiguous 0 O 1 l I if our charset excludes them — allow digits 2-9
    expect(pw).not.toMatch(/[01IlO]/);
  });

  it("varies with different random bytes", () => {
    const a = generateTempPassword(() => new Uint8Array(14).fill(1));
    const b = generateTempPassword(() => new Uint8Array(14).fill(2));
    expect(a).not.toEqual(b);
    expect(a).toHaveLength(14);
    expect(b).toHaveLength(14);
  });
});

describe("temp expiry and force-change decisions", () => {
  const now = new Date("2026-07-18T12:00:00.000Z");

  it("forces change when must_change and issued within 24h", () => {
    const issued = new Date(now.getTime() - 60 * 60 * 1000).toISOString(); // 1h ago
    const state = { must_change_password: true, temp_password_issued_at: issued };
    expect(mustForcePasswordChange(state, now)).toBe(true);
    expect(shouldRejectExpiredTemp(state, now)).toBe(false);
  });

  it("rejects login decision for temp older than 24h", () => {
    const issued = new Date(now.getTime() - TEMP_PASSWORD_TTL_MS - 1000).toISOString();
    const state = { must_change_password: true, temp_password_issued_at: issued };
    expect(isTempPasswordExpired(issued, now)).toBe(true);
    expect(shouldRejectExpiredTemp(state, now)).toBe(true);
    expect(mustForcePasswordChange(state, now)).toBe(false);
  });

  it("does not force change after clear", () => {
    const cleared = clearTempCredentialFields();
    expect(mustForcePasswordChange(cleared, now)).toBe(false);
    expect(shouldRejectExpiredTemp(cleared, now)).toBe(false);
  });

  it("issueTempCredentialFields marks must_change and timestamp", () => {
    const fields = issueTempCredentialFields(now);
    expect(fields.must_change_password).toBe(true);
    expect(fields.temp_password_issued_at).toBe(now.toISOString());
  });
});

describe("validatePermanentPassword", () => {
  it("rejects short passwords", () => {
    expect(validatePermanentPassword("abc")).toBeTruthy();
  });
  it("accepts long enough passwords", () => {
    expect(validatePermanentPassword("abcdefgh")).toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import {
  DEFAULT_IDLE_TIMEOUT_MINUTES,
  idleTimeoutMs,
  isIdleExpired,
  normalizeIdleTimeoutMinutes,
} from "./idle-timeout";

describe("idle timeout", () => {
  it("uses a safe 15-minute default for invalid configuration", () => {
    expect(normalizeIdleTimeoutMinutes(undefined)).toBe(DEFAULT_IDLE_TIMEOUT_MINUTES);
    expect(normalizeIdleTimeoutMinutes(-1)).toBe(DEFAULT_IDLE_TIMEOUT_MINUTES);
    expect(normalizeIdleTimeoutMinutes(481)).toBe(DEFAULT_IDLE_TIMEOUT_MINUTES);
  });

  it("allows zero to disable automatic locking", () => {
    expect(idleTimeoutMs(0)).toBeNull();
    expect(isIdleExpired(0, 99_999_999, 0)).toBe(false);
  });

  it("locks exactly after the configured inactivity interval", () => {
    const start = 1_000;
    expect(isIdleExpired(start, start + 14 * 60_000 + 59_999, 15)).toBe(false);
    expect(isIdleExpired(start, start + 15 * 60_000, 15)).toBe(true);
  });
});

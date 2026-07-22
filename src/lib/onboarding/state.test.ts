import { describe, expect, it, beforeEach } from "vitest";
import {
  isOnboardingDone,
  markOnboardingDone,
  readOnboardingState,
  resetOnboardingForTests,
  ONBOARDING_STORAGE_KEY,
} from "./state";

function installLocalStorage() {
  const map = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", {
    value: {
      getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
      setItem: (k: string, v: string) => map.set(k, String(v)),
      removeItem: (k: string) => map.delete(k),
    },
    configurable: true,
  });
}

describe("onboarding state", () => {
  beforeEach(() => {
    installLocalStorage();
    resetOnboardingForTests();
  });

  it("starts incomplete", () => {
    expect(isOnboardingDone()).toBe(false);
    expect(readOnboardingState().done).toBe(false);
  });

  it("marks done and does not re-show", () => {
    markOnboardingDone();
    expect(isOnboardingDone()).toBe(true);
    expect(localStorage.getItem(ONBOARDING_STORAGE_KEY)).toBeTruthy();
    markOnboardingDone({ skipped: true });
    expect(readOnboardingState().skipped).toBe(true);
  });
});

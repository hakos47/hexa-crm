/**
 * First-run onboarding flag (issue #11).
 * Client-local so demos/browser and multi-device don't fight over server settings.
 */

export const ONBOARDING_STORAGE_KEY = "hexa-crm-onboarding-v1";

export type OnboardingState = {
  done: boolean;
  skipped?: boolean;
  completed_at?: string;
};

export function readOnboardingState(): OnboardingState {
  if (typeof localStorage === "undefined") return { done: false };
  try {
    const raw = localStorage.getItem(ONBOARDING_STORAGE_KEY);
    if (!raw) return { done: false };
    const parsed = JSON.parse(raw) as OnboardingState;
    return { done: !!parsed.done, skipped: !!parsed.skipped, completed_at: parsed.completed_at };
  } catch {
    return { done: false };
  }
}

export function isOnboardingDone(): boolean {
  return readOnboardingState().done;
}

export function markOnboardingDone(opts?: { skipped?: boolean }): OnboardingState {
  const state: OnboardingState = {
    done: true,
    skipped: !!opts?.skipped,
    completed_at: new Date().toISOString(),
  };
  if (typeof localStorage !== "undefined") {
    localStorage.setItem(ONBOARDING_STORAGE_KEY, JSON.stringify(state));
  }
  return state;
}

export function resetOnboardingForTests(): void {
  if (typeof localStorage !== "undefined") {
    localStorage.removeItem(ONBOARDING_STORAGE_KEY);
  }
}

export const DEFAULT_IDLE_TIMEOUT_MINUTES = 15;
export const MAX_IDLE_TIMEOUT_MINUTES = 480;

export function normalizeIdleTimeoutMinutes(value: unknown): number {
  const minutes = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(minutes) || minutes < 0 || minutes > MAX_IDLE_TIMEOUT_MINUTES) {
    return DEFAULT_IDLE_TIMEOUT_MINUTES;
  }
  return minutes;
}

export function idleTimeoutMs(minutes: unknown): number | null {
  const normalized = normalizeIdleTimeoutMinutes(minutes);
  return normalized === 0 ? null : normalized * 60_000;
}

export function isIdleExpired(lastActivityMs: number, nowMs: number, minutes: unknown): boolean {
  const timeout = idleTimeoutMs(minutes);
  return timeout !== null && nowMs - lastActivityMs >= timeout;
}

/** Money helpers — all amounts stored as integer cents (EUR). */

export function eurosToCents(euros: number): number {
  return Math.round(euros * 100);
}

export function centsToEuros(cents: number): number {
  return cents / 100;
}

export function formatEUR(cents: number, opts?: { signed?: boolean }): string {
  const value = centsToEuros(cents);
  const formatted = new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: "EUR",
  }).format(Math.abs(value));

  if (opts?.signed && cents !== 0) {
    return cents > 0 ? `+${formatted}` : `−${formatted}`;
  }
  if (cents < 0) return `−${formatted}`;
  return formatted;
}

export function parseEurosInput(raw: string): number | null {
  const cleaned = raw.trim().replace(/\s/g, "").replace(",", ".");
  if (!cleaned) return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return null;
  return eurosToCents(n);
}

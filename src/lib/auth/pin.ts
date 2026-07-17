/**
 * Lightweight PIN hashing for local POS auth.
 * Format: `v1$<salt_hex>$<sha256_hex>`
 */

function toHex(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function sha256Hex(message: string): Promise<string> {
  if (typeof crypto !== "undefined" && crypto.subtle) {
    const data = new TextEncoder().encode(message);
    const dig = await crypto.subtle.digest("SHA-256", data);
    return toHex(dig);
  }
  const { createHash } = await import("node:crypto");
  return createHash("sha256").update(message).digest("hex");
}

function randomSalt(): string {
  const bytes = new Uint8Array(16);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  return toHex(bytes);
}

export function validatePin(pin: string): string | null {
  const p = pin.trim();
  if (!/^\d{4,8}$/.test(p)) {
    return "El PIN debe tener entre 4 y 8 dígitos";
  }
  return null;
}

/** Hash any credential string (PIN or password). Does not enforce PIN format. */
export async function hashCredential(secret: string): Promise<string> {
  const s = secret.trim();
  if (!s) throw new Error("Credencial vacía");
  const salt = randomSalt();
  const digest = await sha256Hex(`${salt}:${s}`);
  return `v1$${salt}$${digest}`;
}

export async function hashPin(pin: string): Promise<string> {
  const err = validatePin(pin);
  if (err) throw new Error(err);
  return hashCredential(pin);
}

export async function verifyPin(pin: string, stored: string): Promise<boolean> {
  return verifyCredential(pin, stored);
}

export async function verifyCredential(secret: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 3 || parts[0] !== "v1") return false;
  const [, salt, expected] = parts;
  const digest = await sha256Hex(`${salt}:${secret.trim()}`);
  return digest === expected;
}

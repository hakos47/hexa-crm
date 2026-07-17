/**
 * Temporary credential policy for created users.
 * - Temp password: exactly 14 chars from a safe charset
 * - Must change within 24h of issuance on first login
 * - After successful change, normal access without force-change
 */

export const TEMP_PASSWORD_LENGTH = 14;
export const TEMP_PASSWORD_TTL_MS = 24 * 60 * 60 * 1000;
/** Permanent password minimum after forced change */
export const PERMANENT_PASSWORD_MIN = 8;

/** Unambiguous alphanumeric charset (no 0/O/1/l/I). */
const TEMP_CHARSET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";

export type TempCredentialState = {
  must_change_password: boolean;
  temp_password_issued_at: string | null;
};

/** Generate a cryptographically random 14-character temporary password. */
export function generateTempPassword(
  randomBytes?: (n: number) => Uint8Array
): string {
  const bytes =
    randomBytes?.(TEMP_PASSWORD_LENGTH) ??
    (() => {
      const b = new Uint8Array(TEMP_PASSWORD_LENGTH);
      if (typeof crypto !== "undefined" && crypto.getRandomValues) {
        crypto.getRandomValues(b);
      } else {
        for (let i = 0; i < b.length; i++) b[i] = Math.floor(Math.random() * 256);
      }
      return b;
    })();

  let out = "";
  for (let i = 0; i < TEMP_PASSWORD_LENGTH; i++) {
    out += TEMP_CHARSET[bytes[i]! % TEMP_CHARSET.length];
  }
  return out;
}

export function isTempPasswordExpired(
  issuedAt: string | null | undefined,
  now: Date = new Date()
): boolean {
  if (!issuedAt) return true;
  const t = Date.parse(issuedAt);
  if (Number.isNaN(t)) return true;
  return now.getTime() - t > TEMP_PASSWORD_TTL_MS;
}

/**
 * Whether login should be rejected because a temporary credential is expired.
 * Only applies when must_change_password is still true.
 */
export function shouldRejectExpiredTemp(
  state: TempCredentialState,
  now: Date = new Date()
): boolean {
  if (!state.must_change_password) return false;
  return isTempPasswordExpired(state.temp_password_issued_at, now);
}

/**
 * Whether the shell must show the force-change gate after a successful login.
 */
export function mustForcePasswordChange(
  state: TempCredentialState,
  now: Date = new Date()
): boolean {
  if (!state.must_change_password) return false;
  if (isTempPasswordExpired(state.temp_password_issued_at, now)) return false;
  return true;
}

export function validatePermanentPassword(password: string): string | null {
  const p = password.trim();
  if (p.length < PERMANENT_PASSWORD_MIN) {
    return `La contraseña debe tener al menos ${PERMANENT_PASSWORD_MIN} caracteres`;
  }
  if (p.length > 128) {
    return "La contraseña es demasiado larga";
  }
  return null;
}

/** Fields set when issuing a new temporary password. */
export function issueTempCredentialFields(now: Date = new Date()): TempCredentialState {
  return {
    must_change_password: true,
    temp_password_issued_at: now.toISOString(),
  };
}

/** Fields after a successful forced/permanent change. */
export function clearTempCredentialFields(): TempCredentialState {
  return {
    must_change_password: false,
    temp_password_issued_at: null,
  };
}

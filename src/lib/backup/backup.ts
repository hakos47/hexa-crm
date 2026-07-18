/**
 * Versioned full-store backup / restore (browser localStorage path).
 * Pure helpers — no DOM side effects — for testable integrity.
 */

export const BACKUP_FORMAT = "nix-c-backup" as const;
export const BACKUP_VERSION = 1 as const;

export type BackupEnvelope = {
  format: typeof BACKUP_FORMAT;
  version: typeof BACKUP_VERSION;
  created_at: string;
  /** SHA-256 hex of canonical payload JSON */
  checksum: string;
  payload: unknown;
};

export type BackupValidation =
  | { ok: true; envelope: BackupEnvelope }
  | { ok: false; error: string };

function stableStringify(value: unknown): string {
  return JSON.stringify(value);
}

/** Browser-safe SHA-256 hex (Web Crypto). */
export async function sha256Hex(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function createBackupEnvelope(payload: unknown): Promise<BackupEnvelope> {
  const body = stableStringify(payload);
  const checksum = await sha256Hex(body);
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    created_at: new Date().toISOString(),
    checksum,
    payload,
  };
}

export async function validateBackup(raw: unknown): Promise<BackupValidation> {
  if (raw == null || typeof raw !== "object") {
    return { ok: false, error: "Copia inválida: no es un objeto JSON." };
  }
  const env = raw as Partial<BackupEnvelope>;
  if (env.format !== BACKUP_FORMAT) {
    return {
      ok: false,
      error: `Formato desconocido (${String(env.format)}). Se espera "${BACKUP_FORMAT}".`,
    };
  }
  if (env.version !== BACKUP_VERSION) {
    return {
      ok: false,
      error: `Versión de copia no soportada (${String(env.version)}). Actual: ${BACKUP_VERSION}.`,
    };
  }
  if (typeof env.checksum !== "string" || env.checksum.length < 32) {
    return { ok: false, error: "Copia corrupta: falta checksum." };
  }
  if (env.payload === undefined) {
    return { ok: false, error: "Copia corrupta: falta payload." };
  }
  const expected = await sha256Hex(stableStringify(env.payload));
  if (expected !== env.checksum) {
    return {
      ok: false,
      error: "Copia corrupta: el checksum no coincide (archivo alterado o incompleto).",
    };
  }
  return {
    ok: true,
    envelope: {
      format: BACKUP_FORMAT,
      version: BACKUP_VERSION,
      created_at: typeof env.created_at === "string" ? env.created_at : "",
      checksum: env.checksum,
      payload: env.payload,
    },
  };
}

export function parseBackupJson(text: string): BackupValidation | Promise<BackupValidation> {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: "Copia inválida: JSON mal formado." };
  }
  return validateBackup(raw);
}

/**
 * Pre-migration snapshot: same envelope, tagged reason in payload wrapper.
 */
export async function createPreMigrationBackup(
  payload: unknown,
  reason: string,
): Promise<BackupEnvelope> {
  return createBackupEnvelope({
    _meta: { kind: "pre-migration", reason, at: new Date().toISOString() },
    store: payload,
  });
}

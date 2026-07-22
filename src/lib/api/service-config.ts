export type ServiceKey = { keyId: string; tenantCode: string; secret: string };

/** Parses secret-store JSON: [{"keyId":"meiga-2026-07","tenantCode":"MEIGA","secret":"…"}]. */
export function serviceKeysFromEnv(raw: string | undefined): ServiceKey[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((entry): entry is ServiceKey =>
      !!entry && typeof entry === "object" && typeof (entry as any).keyId === "string" && typeof (entry as any).tenantCode === "string" && typeof (entry as any).secret === "string" && (entry as any).secret.length >= 16,
    );
  } catch { return []; }
}

export function findServiceKey(keys: ServiceKey[], keyId: string): ServiceKey | undefined {
  return keys.find((key) => key.keyId === keyId);
}

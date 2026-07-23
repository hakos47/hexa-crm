import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export type ServiceRequest = {
  keyId: string;
  timestamp: string;
  signature: string;
  method: string;
  path: string;
  body: string;
};

export function serviceSigningPayload(input: Pick<ServiceRequest, "timestamp" | "method" | "path" | "body">): string {
  const bodyHash = createHash("sha256").update(input.body).digest("hex");
  return `${input.timestamp}\n${input.method.toUpperCase()}\n${input.path}\n${bodyHash}`;
}

export function signServiceRequest(secret: string, input: Pick<ServiceRequest, "timestamp" | "method" | "path" | "body">): string {
  return createHmac("sha256", secret).update(serviceSigningPayload(input)).digest("hex");
}

export function verifyServiceRequest(
  request: ServiceRequest,
  secret: string | undefined,
  now = Date.now(),
  maxAgeMs = 300_000,
): { ok: true } | { ok: false; code: "unknown_key" | "expired" | "invalid_signature" } {
  if (!secret) return { ok: false, code: "unknown_key" };
  const timestamp = Date.parse(request.timestamp);
  if (!Number.isFinite(timestamp) || Math.abs(now - timestamp) > maxAgeMs) return { ok: false, code: "expired" };
  const expected = signServiceRequest(secret, request);
  const actual = Buffer.from(request.signature, "hex");
  const expectedBuffer = Buffer.from(expected, "hex");
  if (actual.length !== expectedBuffer.length || !timingSafeEqual(actual, expectedBuffer)) return { ok: false, code: "invalid_signature" };
  return { ok: true };
}

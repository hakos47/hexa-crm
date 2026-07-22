import { describe, expect, it } from "vitest";
import { signServiceRequest, verifyServiceRequest } from "./service-auth";

const timestamp = "2026-07-22T12:00:00.000Z";
const base = { keyId: "meiga-2026-07", timestamp, method: "POST", path: "/api/v1/reservations", body: '{"sku":"M-1"}' };

describe("service HMAC", () => {
  it("accepts a signed request and rejects altered body or old timestamp", () => {
    const signature = signServiceRequest("secret", base);
    expect(verifyServiceRequest({ ...base, signature }, "secret", Date.parse(timestamp))).toEqual({ ok: true });
    expect(verifyServiceRequest({ ...base, body: "{}", signature }, "secret", Date.parse(timestamp))).toMatchObject({ code: "invalid_signature" });
    expect(verifyServiceRequest({ ...base, signature }, "secret", Date.parse(timestamp) + 300_001)).toMatchObject({ code: "expired" });
  });
});

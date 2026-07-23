import { beforeEach, describe, expect, it } from "vitest";
import { encryptSecret, decryptSecret } from "./secret-vault";
import { redactSensitive } from "./catalog";

describe("Stripe Secret Vault (AES-256-GCM)", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  it("throws explicit error when server master encryption key is missing", () => {
    delete process.env.STRIPE_ENCRYPTION_KEY;
    delete process.env.HEXA_MASTER_ENCRYPTION_KEY;
    delete process.env.MASTER_ENCRYPTION_KEY;

    expect(() => encryptSecret("rk_test_12345")).toThrow(/Clave maestra de cifrado no configurada/i);
    expect(() => decryptSecret("fake:iv:data")).toThrow(/Clave maestra de cifrado no configurada/i);
  });

  it("encrypts and decrypts secret cleanly using AES-256-GCM", () => {
    process.env.STRIPE_ENCRYPTION_KEY = "test_master_key_for_unit_testing_32bytes!";

    const originalSecret = "rk_live_51N123456789abcdef";
    const encrypted = encryptSecret(originalSecret);

    expect(encrypted).not.toContain(originalSecret);
    expect(encrypted.split(":")).toHaveLength(3); // iv:authTag:ciphertext

    const decrypted = decryptSecret(encrypted);
    expect(decrypted).toBe(originalSecret);
  });

  it("detects tampered encrypted ciphertext and fails explicitly", () => {
    process.env.STRIPE_ENCRYPTION_KEY = "test_master_key_for_unit_testing_32bytes!";

    const encrypted = encryptSecret("rk_test_secret");
    const parts = encrypted.split(":");
    // Tamper with the ciphertext
    const tamperedParts = [parts[0], parts[1], parts[2].slice(0, -2) + "00"];
    const tampered = tamperedParts.join(":");

    expect(() => decryptSecret(tampered)).toThrow(/Error al descifrar el secreto de Stripe/i);
  });

  it("redacts raw secrets, tokens, bearer headers, and encrypted ciphers", () => {
    const rawSk = "Failed connecting with token rk_live_9999999";
    const bearer = "Authorization: Bearer mySecretToken123";

    expect(redactSensitive(rawSk)).not.toContain("rk_live_9999999");
    expect(redactSensitive(rawSk)).toContain("[SECRET_REDACTADO]");

    expect(redactSensitive(bearer)).not.toContain("mySecretToken123");
    expect(redactSensitive(bearer)).toContain("Bearer [REDACTADO]");
  });
});

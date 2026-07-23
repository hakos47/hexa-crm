import crypto from "node:crypto";

/**
 * Deriva la clave maestra de cifrado de 32 bytes (256 bits) desde las variables de entorno del servidor.
 * Claves soportadas: STRIPE_ENCRYPTION_KEY, HEXA_MASTER_ENCRYPTION_KEY o MASTER_ENCRYPTION_KEY.
 *
 * Si no hay clave configurada en el entorno, lanza un error explícito.
 * Prohibido guardar en texto plano o usar fallbacks silenciosos.
 */
function getMasterKey(): Buffer {
  const envKey =
    typeof process !== "undefined"
      ? process.env?.STRIPE_ENCRYPTION_KEY ||
        process.env?.HEXA_MASTER_ENCRYPTION_KEY ||
        process.env?.MASTER_ENCRYPTION_KEY
      : "";

  if (!envKey || !envKey.trim()) {
    throw new Error(
      "Clave maestra de cifrado no configurada en el servidor (STRIPE_ENCRYPTION_KEY / HEXA_MASTER_ENCRYPTION_KEY)",
    );
  }

  return crypto.createHash("sha256").update(envKey.trim()).digest();
}

/**
 * Cifra un secreto en texto plano utilizando cifrado autenticado AES-256-GCM.
 * Genera un vector de inicialización (IV) único de 12 bytes por operación.
 * Retorna la representación serializada `iv:authTag:ciphertext` en hexadecimal.
 */
export function encryptSecret(plaintext: string): string {
  if (!plaintext || typeof plaintext !== "string" || !plaintext.trim()) {
    throw new Error("El secreto a cifrar no puede estar vacío");
  }

  const key = getMasterKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);

  let encrypted = cipher.update(plaintext.trim(), "utf8", "hex");
  encrypted += cipher.final("hex");

  const authTag = cipher.getAuthTag().toString("hex");
  const ivHex = Buffer.from(iv).toString("hex");

  return `${ivHex}:${authTag}:${encrypted}`;
}

/**
 * Descifra un secreto cifrado con AES-256-GCM.
 * Verifica la autenticidad con authTag antes de retornar el texto plano.
 * Lanza error explícito si la clave es errónea o el secreto fue manipulado.
 */
export function decryptSecret(cipherText: string): string {
  if (!cipherText || typeof cipherText !== "string" || !cipherText.trim()) {
    throw new Error("No hay secreto cifrado almacenado");
  }

  const key = getMasterKey();
  const parts = cipherText.trim().split(":");

  if (parts.length !== 3) {
    throw new Error("Formato de secreto cifrado inválido");
  }

  const [ivHex, authTagHex, encryptedHex] = parts;
  if (!ivHex || !authTagHex || !encryptedHex) {
    throw new Error("Formato de secreto cifrado incompleto");
  }

  try {
    const iv = Buffer.from(ivHex, "hex");
    const authTag = Buffer.from(authTagHex, "hex");
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encryptedHex, "hex", "utf8");
    decrypted += decipher.final("utf8");

    return decrypted;
  } catch (error) {
    if (error instanceof Error && error.message.includes("Clave maestra")) {
      throw error;
    }
    throw new Error("Error al descifrar el secreto de Stripe: clave o integridad no válida");
  }
}

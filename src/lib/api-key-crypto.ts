import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

function toBase64Url(input: Buffer): string {
  return input
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function fromBase64Url(input: string): Buffer {
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  const padding = normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4));
  return Buffer.from(`${normalized}${padding}`, "base64");
}

function getEncryptionKey() {
  const secret = process.env.API_KEY_ENCRYPTION_SECRET;
  if (!secret) {
    throw new Error("Missing API_KEY_ENCRYPTION_SECRET");
  }

  return createHash("sha256").update(secret).digest();
}

export function encryptApiKey(rawApiKey: string): string {
  const trimmed = rawApiKey.trim();
  if (!trimmed) {
    throw new Error("API key cannot be empty");
  }

  const key = getEncryptionKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);

  const encrypted = Buffer.concat([cipher.update(trimmed, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return `enc:v1:${toBase64Url(iv)}:${toBase64Url(encrypted)}:${toBase64Url(authTag)}`;
}

export function decryptApiKey(encryptedValue: string): string {
  if (!encryptedValue.startsWith("enc:v1:")) {
    return encryptedValue;
  }

  const parts = encryptedValue.split(":");
  if (parts.length !== 5) {
    throw new Error("Malformed encrypted API key payload");
  }

  const [, , ivB64, payloadB64, tagB64] = parts;
  const key = getEncryptionKey();
  const iv = fromBase64Url(ivB64);
  const payload = fromBase64Url(payloadB64);
  const authTag = fromBase64Url(tagB64);

  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([decipher.update(payload), decipher.final()]);
  return decrypted.toString("utf8");
}

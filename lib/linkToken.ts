import crypto from "node:crypto";

const KEY = Buffer.from(process.env.LINK_ENCRYPTION_KEY!, "base64");

export function encryptLink(payload: object, ttlMs: number): string {
  const plaintext = JSON.stringify({
    ...payload,
    expiresAt: Date.now() + ttlMs,
  });
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", KEY, iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, ciphertext]).toString("base64url");
}

export function decryptLink<T>(
  token: string,
): { valid: true; data: T } | { valid: false; reason: string } {
  try {
    const combined = Buffer.from(token, "base64url");
    const iv = combined.subarray(0, 12);
    const authTag = combined.subarray(12, 28);
    const ciphertext = combined.subarray(28);

    const decipher = crypto.createDecipheriv("aes-256-gcm", KEY, iv);
    decipher.setAuthTag(authTag);
    const plaintext = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]).toString("utf8");

    const data = JSON.parse(plaintext);
    if (Date.now() > data.expiresAt) {
      return { valid: false, reason: "expired" };
    }
    return { valid: true, data };
  } catch {
    return { valid: false, reason: "invalid or tampered" };
  }
}

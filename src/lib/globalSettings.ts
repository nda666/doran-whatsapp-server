import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { z } from "zod";

export const POSTMARK_TOKEN_KEY = "postmark-server-token";
export function slugSettingKey(value: string) {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}
// Settings are plain text. Remove invisible controls; React escapes markup when displaying it.
// Consumers must validate the setting for their purpose and escape it if inserted into HTML.
export function sanitizeSettingValue(value: string) {
  return value.replace(/\r\n?/g, "\n").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g, "").trim();
}
export const settingInput = z.object({
  label: z.string().trim().min(1, "Label wajib diisi.").max(200),
  key: z.string().max(200).optional(),
  value: z.string().max(16000).transform(sanitizeSettingValue),
}).strict();
export function secretSetting(key: string) {
  return /(?:^|-)(?:token|secret|password|api-key)(?:-|$)/.test(key);
}
function encryptionKey() {
  const secret = process.env.SETTINGS_ENCRYPTION_KEY || process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error("Settings encryption is not configured");
  return createHash("sha256").update(`global-settings:${secret}`).digest();
}
export function encryptSetting(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return ["enc-v1", iv.toString("base64"), cipher.getAuthTag().toString("base64"), encrypted.toString("base64")].join(":");
}
export function decryptSetting(value: string) {
  const [version, iv, tag, data] = value.split(":");
  if (version !== "enc-v1" || !iv || !tag || data === undefined) throw new Error("Invalid encrypted setting");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64")), decipher.final()]).toString("utf8");
}

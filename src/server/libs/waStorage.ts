import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

export const storageHash = (value: string) => createHash("sha256").update(value).digest("hex");
function key() {
  const secret = process.env.WA_AUTH_ENCRYPTION_KEY || process.env.SETTINGS_ENCRYPTION_KEY || process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error("WA_STORAGE_ENCRYPTION_NOT_CONFIGURED");
  return createHash("sha256").update(`wa-storage-v1:${secret}`).digest();
}
export function sealWa(value: string, context: string) {
  const iv = randomBytes(12), cipher = createCipheriv("aes-256-gcm", key(), iv);
  cipher.setAAD(Buffer.from(context));
  const data = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return ["wa1", iv.toString("base64"), cipher.getAuthTag().toString("base64"), data.toString("base64")].join(":");
}
export function openWa(value: string, context: string) {
  const [version, iv, tag, data] = value.split(":");
  if (version !== "wa1" || !iv || !tag || data === undefined) throw new Error("WA_STORAGE_INVALID");
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64"));
  decipher.setAAD(Buffer.from(context));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64")), decipher.final()]).toString("utf8");
}

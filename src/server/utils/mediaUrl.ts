import { createHmac, timingSafeEqual } from "node:crypto";
function signature(userId: string, file: string, expires: string) {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error("Media signing secret unavailable");
  return createHmac("sha256", secret).update(JSON.stringify([userId, file, expires])).digest("hex");
}
export function mediaUrl(file: string | null | undefined, userId: string): string {
  if (!file) return "";
  const expires = String(Date.now() + 3600000);
  const url = new URL(`/api/image/${file}`, process.env.APP_URL);
  url.search = new URLSearchParams({ owner: userId, expires, signature: signature(userId, file, expires) }).toString();
  return url.href;
}
export function verifyMediaSignature(owner: unknown, file: string, expires: unknown, given: unknown): string | null {
  if (typeof owner !== "string" || typeof expires !== "string" || typeof given !== "string" || !/^\d{13}$/.test(expires) || !/^[a-f0-9]{64}$/.test(given)) return null;
  if (Number(expires) <= Date.now() || Number(expires) > Date.now() + 3600000) return null;
  return timingSafeEqual(Buffer.from(given, "hex"), Buffer.from(signature(owner, file, expires), "hex")) ? owner : null;
}

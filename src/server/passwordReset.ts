import { createHash, randomBytes } from "node:crypto";
import type { NextApiRequest } from "next";
import { prisma } from "../lib/prisma";
import { decryptSetting, POSTMARK_TOKEN_KEY } from "../lib/globalSettings";
import { DEFAULT_EMAIL_FROM, EMAIL_FROM_KEY, emailFromInput } from "../lib/emailSettings";

export const RESET_TTL_MS = 30 * 60 * 1000;
export const resetTokenHash = (token: string) => createHash("sha256").update(token).digest("hex");
export const newResetToken = () => randomBytes(32).toString("hex");
export const escapeEmailHtml = (value: string) => value.replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]!));

export function requestIp(req: NextApiRequest) {
  const forwarded = req.headers["x-forwarded-for"];
  if (process.env.AUTH_TRUST_PROXY === "true" && typeof forwarded === "string") return forwarded.split(",")[0].trim().slice(0, 128);
  return req.socket?.remoteAddress || "unknown";
}
export function validAuthOrigin(req: NextApiRequest) {
  const origin = req.headers.origin;
  try { return !origin || origin === new URL(process.env.NEXTAUTH_URL!).origin; } catch { return false; }
}
export async function authRateLimit(scope: string, identity: string, maximum: number) {
  const period = 15 * 60 * 1000;
  const window = Math.floor(Date.now() / period);
  const key = resetTokenHash(`${scope}:${identity}:${window}`);
  await prisma.authRateLimit.deleteMany({ where: { expiresAt: { lt: new Date() } } });
  await prisma.authRateLimit.createMany({ data: [{ key, count: 0, expiresAt: new Date((window + 1) * period) }], skipDuplicates: true });
  const state = await prisma.authRateLimit.update({ where: { key }, data: { count: { increment: 1 } } });
  return state.count <= maximum;
}
export function passwordResetUrl(token: string) {
  // A fragment keeps the reset token out of HTTP request/access logs and Referer headers.
  const url = new URL("/reset-password", process.env.NEXTAUTH_URL);
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("Invalid reset URL configuration");
  url.hash = new URLSearchParams({ token }).toString();
  return url.toString();
}
export async function postmarkServerToken() {
  const row = await prisma.globalSetting.findUnique({ where: { key: POSTMARK_TOKEN_KEY } });
  if (!row) throw new Error("Postmark token is not configured");
  const value = decryptSetting(row.value);
  if (!value) throw new Error("Postmark token is empty");
  return value;
}
export async function sendResetEmail(to: string, name: string | null, link: string, serverToken: string) {
  const senderSetting = await prisma.globalSetting.findUnique({ where: { key: EMAIL_FROM_KEY } });
  const from = emailFromInput.parse(senderSetting ? decryptSetting(senderSetting.value) : DEFAULT_EMAIL_FROM);
  await prisma.emailSequence.createMany({ data: [{ id: 1, attempts: 0 }], skipDuplicates: true });
  const sequence = await prisma.emailSequence.update({ where: { id: 1 }, data: { attempts: { increment: 1 } } });
  const stream = sequence.attempts % BigInt(2) === BigInt(1) ? "outbound" : "broadcast";
  const response = await fetch("https://api.postmarkapp.com/email", {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json", "X-Postmark-Server-Token": serverToken },
    signal: AbortSignal.timeout(15000),
    body: JSON.stringify({
      From: from, To: to, Subject: "Reset Password", MessageStream: stream,
      HtmlBody: `<p>Halo ${escapeEmailHtml(name || "pengguna")},</p><p>Klik tautan berikut untuk membuat password baru:</p><p><a href="${escapeEmailHtml(link)}">Reset password</a></p><p>Tautan berlaku 30 menit dan hanya dapat digunakan satu kali. Jika Anda tidak meminta reset password, abaikan email ini.</p>`,
      TextBody: `Halo ${name || "pengguna"},\n\nBuat password baru melalui tautan berikut:\n${link}\n\nTautan berlaku 30 menit dan hanya dapat digunakan satu kali. Jika Anda tidak meminta reset password, abaikan email ini.`,
    }),
  });
  const result = await response.json() as { ErrorCode?: number };
  // Never include the request headers, reset link, token, recipient or provider response in logs/errors.
  if (!response.ok || result.ErrorCode !== 0) throw new Error("Postmark reset email failed");
}

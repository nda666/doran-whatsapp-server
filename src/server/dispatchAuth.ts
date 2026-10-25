import type { NextApiRequest } from "next";
import { prisma } from "@/lib/prisma";
import { isApproved } from "@/lib/access";

export class DispatchAuthError extends Error {
  constructor(public status: number, message: string, public invalidToken = false) { super(message); }
}
// Shared credentials for sending and registered-phone inventory; no cookie authentication.
export async function resolveIntegrationIdentity(req: Pick<NextApiRequest, "headers" | "query">, input: any) {
  const bearer = typeof req.headers.authorization === "string" ? /^Bearer\s+(.+)$/i.exec(req.headers.authorization)?.[1] : undefined;
  const values = [bearer, input?.api_key, req.query?.api_key, input?.token_api, req.query?.token_api].filter(value => value !== undefined && value !== null && value !== "");
  if (!values.length) throw new DispatchAuthError(401, "Token tidak valid", true);
  if (values.some(value => typeof value !== "string" || !value.trim() || value.trim().length > 256)) throw new DispatchAuthError(401, "Token tidak valid", true);
  const tokens = values.map(value => (value as string).trim());
  if (new Set(tokens).size !== 1) throw new DispatchAuthError(400, "Kredensial berbeda dikirim bersamaan. Gunakan satu token yang sama.");
  const token = tokens[0];
  const ids = [input?.device_id, req.query?.device_id].filter(value => value !== undefined && value !== null && value !== "");
  if (ids.some(value => typeof value !== "string" || !value.trim() || value.length > 191)) throw new DispatchAuthError(400, "device_id tidak valid.");
  const deviceIds = ids.map(value => (value as string).trim());
  if (new Set(deviceIds).size > 1) throw new DispatchAuthError(400, "device_id pada body dan query harus sama.");
  const deviceId = deviceIds[0];
  const [device, userToken] = await Promise.all([
    prisma.phone.findUnique({ where: { token } }),
    prisma.user.findUnique({ where: { token } }),
  ]);
  if (device && userToken) throw new DispatchAuthError(400, "Token ambigu. Hubungi admin untuk mengganti token.");
  if (device) {
    if (deviceId && deviceId !== device.id) throw new DispatchAuthError(403, "device_id tidak cocok dengan token device.");
    const owner = await prisma.user.findUnique({ where: { id: device.userId } });
    if (!owner || !isApproved(owner)) throw new DispatchAuthError(403, "Akun pemilik perangkat tidak aktif atau belum disetujui.");
    return { device, user: owner, deviceId, token, mode: "device" as const };
  }
  if (!userToken) throw new DispatchAuthError(401, "Token tidak valid", true);
  if (!bearer || bearer.trim() !== token) throw new DispatchAuthError(400, "Token user harus dikirim melalui Authorization: Bearer.");
  if (!isApproved(userToken)) throw new DispatchAuthError(403, "Akun tidak aktif atau belum disetujui.");
  return { device: null, user: userToken, deviceId, token, mode: "user" as const };
}

export async function resolveDispatchDevice(req: Pick<NextApiRequest, "headers" | "query">, input: any) {
  const identity = await resolveIntegrationIdentity(req, input);
  const checkChannel = (phone: { channel?: string }) => {
    if (input?.channel !== undefined && input.channel !== (phone.channel || "whatsapp")) throw new DispatchAuthError(400, "channel tidak cocok dengan perangkat. Pilih token/device_id dari kanal yang dimaksud.");
  };
  if (identity.mode === "device") {
    checkChannel(identity.device!);
    return { phone: identity.device!, token: identity.token, mode: identity.mode };
  }
  if (!identity.deviceId) throw new DispatchAuthError(400, "device_id wajib untuk token user.");
  // No super-admin bypass: a user token can only select that user's own device.
  const phone = await prisma.phone.findFirst({ where: { id: identity.deviceId, OR: [{ assignedUserId: identity.user.id }, { assignedUserId: null, userId: identity.user.id }] } });
  if (!phone) throw new DispatchAuthError(403, "Device tidak tersedia untuk akun ini.");
  checkChannel(phone);
  return { phone, token: identity.token, mode: "user" as const };
}

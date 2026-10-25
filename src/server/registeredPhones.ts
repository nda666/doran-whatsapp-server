import type { NextApiResponse } from "next";
import { prisma } from "@/lib/prisma";
import { normalizePhoneRecipient } from "@/utils/normalizePhoneRecipient";
import { isApproved, isSuperAdmin } from "@/lib/access";

// Tokens are selected only for the designated admin; QR credentials stay private.
const detailSelect = {
  id: true, channel: true, name: true, number: true, account_name: true,
  status: true, isOnline: true, active: true, is_save_group: true,
  webhookUrl: true, readReceipt: true, rejectCall: true,
  showOnline: true, showTyping: true, createdAt: true, updatedAt: true,
  saveIncomingMessages: true,
} as const;

function publicPhone<T extends { id: string; status: string | null; isOnline: boolean }>(phone: T) {
  // Older connection handlers updated only isOnline; do not export stale status.
  const status = phone.isOnline ? "OPEN" : phone.status === "OPEN" ? "CLOSE" : phone.status;
  return { ...phone, status, device_id: phone.id };
}

export async function registeredPhones(
  action: "list-phones" | "phone-detail",
  userId: string,
  input: unknown,
  res: NextApiResponse,
) {
  const owner = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, email: true, role: true, approvalStatus: true, isActive: true } });
  if (!owner || !isApproved(owner)) {
    return res.status(403).json({ result: false, curl_error: null, message: "Akun belum disetujui admin atau telah ditolak." });
  }
  const admin = isSuperAdmin(owner);
  const access = { role: owner.role, scope: admin ? "all" : "own" };
  const where = admin ? {} : { OR: [{ assignedUserId: owner.id }, { assignedUserId: null, userId: owner.id }] };
  const select = admin ? { ...detailSelect, token: true, userId: true, user: { select: { id: true, name: true, email: true } } } : detailSelect;
  if (action === "list-phones") {
    const data = await prisma.phone.findMany({
      where, select,
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
    return res.json({ result: true, access, total: data.length, data: data.map(publicPhone) });
  }
  let number: string;
  try {
    if (typeof input !== "string") throw new Error("Missing number");
    number = normalizePhoneRecipient(input);
  } catch {
    return res.status(400).json({ result: false, curl_error: null, message: "number wajib diisi dengan satu nomor WhatsApp yang valid." });
  }
  // A number can belong to more than one registered device; return all matches
  // rather than choosing a device arbitrarily (the schema has no unique number).
  const data = await prisma.phone.findMany({
    where: { ...where, number }, select,
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
  if (!data.length) return res.status(404).json({ result: false, curl_error: null, message: "Nomor WhatsApp tidak ditemukan dalam data yang dapat diakses." });
  return res.json({ result: true, access, number, total: data.length, data: data.map(publicPhone) });
}

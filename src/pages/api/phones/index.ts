import { getDispatchDisplayWindow } from "@/server/dispatch/settings";
import { tableQuery } from "@/lib/tableQuery";
import { isSuperAdmin, ownerScope } from "@/lib/access";
import type { NextApiResponse } from "next";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import apiAuthMiddleware from "@/middleware/apiAuthMiddleware";
import { AuthNextApiRequest } from "@/types/global";
import { enqueueDeviceEvent, updateDevice } from "@/server/deviceWebhook/events";
import { getPhoneConnectionInfo } from "@/server/phoneConnectionInfo";
import { isPhonePolicySort } from "@/lib/phonePolicySort";
import { phonePolicyPage, phoneQuotaWhere } from "@/server/messaging/phonePolicySort";
import { usageDay } from "@/server/messaging/safety";
import { dispatchDateFilter } from "@/lib/dispatchDateFilter";
import { isTelegramDevice, telegramUnsupportedSettings } from "@/lib/messagingChannel";
const input = z.object({ id: z.string().uuid().optional(), channel: z.enum(["whatsapp", "telegram"]).optional(), name: z.string().trim().min(1).max(200), is_save_group: z.boolean().optional(),
  webhookUrl: z.string().max(2000).refine(v => !v || /^https?:\/\//.test(v), "Webhook URL tidak valid").nullable().optional(),
  warmupEnabled: z.boolean().optional(), readReceipt: z.boolean().optional(), rejectCall: z.boolean().optional(), showOnline: z.boolean().optional(), showTyping: z.boolean().optional(), autoReplyEnabled: z.boolean().optional(), saveIncomingMessages: z.boolean().optional() });
async function saveWarmup(tx: import("@prisma/client").Prisma.TransactionClient, phoneId: string, enabled: boolean) {
  const startedAt = enabled ? new Date() : null;
  await tx.deviceSendPolicy.upsert({ where: { phoneId }, create: { phoneId, warmupStartedAt: startedAt }, update: enabled ? {} : { warmupStartedAt: null } });
  if (enabled) await tx.deviceSendPolicy.updateMany({ where: { phoneId, warmupStartedAt: null }, data: { warmupStartedAt: startedAt } });
}
async function handler(req: AuthNextApiRequest, res: NextApiResponse) {
  res.setHeader("Cache-Control", "no-store"); const userId = req.user!.id;
  if (req.method === "GET") {
    const admin = isSuperAdmin(req.user!);
    if (req.query.summary === "1") {
      const states = await prisma.phone.groupBy({ by: ["isOnline", "active"], where: ownerScope(req.user!), _count: { _all: true } });
      const total = states.reduce((sum, row) => sum + row._count._all, 0);
      const online = states.filter(row => row.isOnline).reduce((sum, row) => sum + row._count._all, 0);
      const active = states.filter(row => row.active === 1).reduce((sum, row) => sum + row._count._all, 0);
      return res.json({ total, online, offline: total - online, active, inactive: total - active });
    }
    if (req.query.options === "1") return res.json(await prisma.phone.findMany({ where: { ...ownerScope(req.user!) }, take: 1000, select: { id: true, channel: true, name: true, number: true, active: true, isOnline: true, autoReplyEnabled: true, saveIncomingMessages: true } }));
    if (req.query.sender_group_options === "1") return res.json(await prisma.senderGroup.findMany({
      where: ownerScope(req.user!), select: { id: true, name: true, enabled: true }, orderBy: [{ name: "asc" }, { id: "asc" }],
    }));
    const { number, name, is_online, active, sender_group, quota_status } = req.query;
    let where: import("@prisma/client").Prisma.PhoneWhereInput = { ...ownerScope(req.user!),
      ...(typeof number === "string" && number ? { number: { contains: number.slice(0, 100) } } : {}),
      ...(typeof name === "string" && name ? { OR: [
        { name: { contains: name.slice(0, 200) } },
        { account_name: { contains: name.slice(0, 200) } },
      ] } : {}),
      ...(is_online === "0" || is_online === "1" ? { isOnline: is_online === "1" } : {}),
      ...(active === "0" || active === "1" ? { active: Number(active) } : {}),
      ...(typeof sender_group === "string" && sender_group ? { senderGroupId: sender_group === "none" ? null : sender_group } : {}) };
    if (quota_status === "fulfilled" || quota_status === "available") where = await phoneQuotaWhere(where, quota_status);
    const { page, limit, skip, orderBy } = tableQuery(req.query, ["name", "number", "account_name", "senderGroup.name", "token", "isOnline", "is_save_group", "active", "createdAt", "lastQrScanAt", "lastOfflineAt", "lastSendProcessedAt", ...(admin ? ["user.name"] : [])], "createdAt", "desc");
    const policyPage = isPhonePolicySort(req.query.sort)
      ? await phonePolicyPage(where, req.query.sort, req.query.order === "asc" ? "asc" : "desc", skip, limit)
      : undefined;
    const [data, total] = await Promise.all([prisma.phone.findMany({
      where: policyPage ? { ...where, id: { in: policyPage.ids } } : where,
      ...(!policyPage ? { take: limit, skip, orderBy } : {}),
      include: { senderGroup: { select: { id: true, name: true, enabled: true } }, ...(admin ? { user: { select: { id: true, name: true, email: true } } } : {}) },
    }), policyPage ? Promise.resolve(policyPage.total) : prisma.phone.count({ where })]);
    if (policyPage) {
      const positions = new Map(policyPage.ids.map((id, position) => [id, position]));
      data.sort((a, b) => positions.get(a.id)! - positions.get(b.id)!);
    }
    const window = await getDispatchDisplayWindow();
    const counts = await prisma.waDispatch.groupBy({ by: ["phoneId"], where: { ...ownerScope(req.user!), createdAt: window.createdAt, phoneId: { in: data.map(p => p.id) }, status: { in: ["SENT", "DELIVERED", "READ"] } }, _count: { _all: true } });
    const today = usageDay();
    const ids = data.map(p => p.id);
    const pending = await prisma.waDispatch.groupBy({ by: ["phoneId", "senderPhoneId"],
      where: { ...ownerScope(req.user!), status: "QUEUED", createdAt: dispatchDateFilter(today, today),
        OR: [{ senderPhoneId: { in: ids } }, { senderPhoneId: null, phoneId: { in: ids } }] }, _count: { _all: true } });
    const pendingBySender = new Map<string, number>();
    for (const row of pending) {
      const id = row.senderPhoneId || row.phoneId;
      pendingBySender.set(id, (pendingBySender.get(id) || 0) + row._count._all);
    }
    const rows = await Promise.all(data.map(async p => ({ ...p, pendingToday: pendingBySender.get(p.id) || 0, connection: await getPhoneConnectionInfo(p), sentCountDays: window.days, sentCount: counts.find(c => c.phoneId === p.id)?._count._all || 0 })));
    // Preserve array shape for integrations that don't request pagination.
    return res.json(req.query.page ? { data: rows, total, page, pageSize: limit } : rows);
  }
  if (req.method !== "POST") return res.status(405).end();
  const parsed = input.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: parsed.error.issues.map(i => i.message).join(", ") });
  const { id, warmupEnabled, channel, ...data } = parsed.data;
  const validateTelegramSettings = () => {
    if (telegramUnsupportedSettings.some(key => data[key] === true) || data.webhookUrl) throw new Error("Provider Telegram belum mendukung pengaturan pesan masuk, sesi, grup, typing, atau read receipt.");
  };
  if (id) {
    try {
    const phone = await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM device_webhook_settings WHERE id = 1 FOR UPDATE`;
      const before = await tx.phone.findFirst({ where: { id, ...ownerScope(req.user!) } });
      if (!before) return null;
      if (channel && channel !== (before.channel || "whatsapp")) throw new Error("Kanal perangkat tidak dapat diubah. Buat perangkat baru agar antrean tidak berpindah kanal.");
      if (isTelegramDevice(before)) validateTelegramSettings();
      const updated = await updateDevice(tx, { id, ...ownerScope(req.user!) }, { ...data,
        ...(data.saveIncomingMessages === true && !before.saveIncomingMessages ? { saveIncomingSince: new Date() } : {}),
      });
      if (warmupEnabled !== undefined) await saveWarmup(tx, id, warmupEnabled);
      return updated;
    });
    if (!phone) return res.status(404).end();
    return res.json(phone);
    } catch (error) {
      return res.status(400).json({ message: error instanceof Error && /^(Kanal perangkat|Provider Telegram)/.test(error.message) ? error.message : "Pengaturan perangkat belum dapat disimpan." });
    }
  }
  try {
    if (channel === "telegram") validateTelegramSettings();
    const phone = await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId} FOR UPDATE`;
      const owner = await tx.user.findUniqueOrThrow({ where: { id: userId } });
      if (!isSuperAdmin(owner) && await tx.phone.count({ where: { userId } }) >= owner.deviceLimit) throw new Error("Limit device telah tercapai.");
      const created = await tx.phone.create({ data: { readReceipt: false, showOnline: channel !== "telegram", showTyping: false, ...data, channel: channel || "whatsapp", userId, ...(data.saveIncomingMessages ? { saveIncomingSince: new Date() } : {}) } });
      if (warmupEnabled !== undefined) await saveWarmup(tx, created.id, warmupEnabled);
      await enqueueDeviceEvent(tx, "device.created", created);
      return created;
    });
    return res.status(201).json(phone);
  } catch (e) { return res.status(409).json({ message: e instanceof Error ? e.message : "Device gagal dibuat." }); }
}
export default apiAuthMiddleware(handler);

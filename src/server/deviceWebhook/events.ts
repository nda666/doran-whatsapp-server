import { randomUUID } from "node:crypto";
import type { Phone, Prisma } from "@prisma/client";
import { conflictingSender, lockSenderMembership, senderMembershipSelect } from "../dispatch/senderNumberMembership";

export function deviceSnapshot(phone: Phone) {
  return {
    id: phone.id, channel: phone.channel || "whatsapp", user_id: phone.userId, name: phone.name, number: phone.number,
    account_name: phone.account_name, active: phone.active, token: phone.token,
    is_save_group: phone.is_save_group, webhook_url: phone.webhookUrl,
    read_receipt: phone.readReceipt, reject_call: phone.rejectCall,
    show_online: phone.showOnline, show_typing: phone.showTyping,
    save_incoming_messages: phone.saveIncomingMessages,
    sender_group_id: phone.senderGroupId, sender_priority: phone.senderPriority,
  };
}

export async function enqueueDeviceEvent(tx: Prisma.TransactionClient, event: string, phone?: Phone, changedFields?: string[]) {
  // Lock configuration so events cannot be admitted with a stale destination revision.
  await tx.$queryRaw`SELECT id FROM device_webhook_settings WHERE id = 1 FOR UPDATE`;
  const config = await tx.deviceWebhookSetting.findUnique({ where: { id: 1 } });
  if (!config?.enabled || !config.url || !config.secret) return;
  const eventId = randomUUID();
  const owner = phone ? await tx.user.findUnique({ where: { id: phone.userId }, select: { id: true, name: true, email: true } }) : null;
  await tx.deviceWebhookEvent.create({ data: {
    eventId, event, deviceId: phone?.id, revision: config.revision,
    payload: JSON.stringify({ event_id: eventId, event, occurred_at: new Date().toISOString(),
      device: phone ? deviceSnapshot(phone) : null, owner,
      ...(changedFields ? { changed_fields: changedFields } : {}),
      ...(event === "device.webhook.test" ? { message: "Tes webhook perubahan perangkat Jeblast. Tidak ada data perangkat yang diubah." } : {}),
    }),
  } });
}

export async function updateDevice(tx: Prisma.TransactionClient, where: Prisma.PhoneWhereInput, data: Prisma.PhoneUpdateManyMutationInput, event = "device.updated") {
  if (typeof data.number === "string") await lockSenderMembership(tx);
  // Consistent lock order also serializes bulk token changes with individual edits.
  await tx.$queryRaw`SELECT id FROM device_webhook_settings WHERE id = 1 FOR UPDATE`;
  let before = await tx.phone.findFirst({ where });
  if (!before) return null;
  await tx.$queryRaw`SELECT id FROM phones WHERE id = ${before.id} FOR UPDATE`;
  before = await tx.phone.findFirst({ where });
  if (!before) return null;
  let clearSenderGroup = false;
  if (typeof data.number === "string" && before.senderGroupId) {
    const members = await tx.phone.findMany({ where: { senderGroupId: { not: null } }, select: senderMembershipSelect });
    if (conflictingSender({ ...before, number: data.number }, members)) {
      // Keep the actual connected number, but remove the newly conflicting
      // membership rather than leaving a stale number or disrupting its socket.
      clearSenderGroup = true;
      console.warn("WA_SENDER_GROUP_MEMBERSHIP_REMOVED", before.id);
    }
  }
  await tx.phone.updateMany({ where: { ...where, id: before.id }, data: {
    ...data,
    ...(clearSenderGroup ? { senderGroupId: null, senderPriority: 0 } : {}),
    ...(before.isOnline && data.isOnline === false ? { lastOfflineAt: new Date() } : {}),
  } });
  const after = await tx.phone.findUniqueOrThrow({ where: { id: before.id } });
  const old = deviceSnapshot(before), next = deviceSnapshot(after);
  const changed = (Object.keys(next) as Array<keyof typeof next>).filter(key => old[key] !== next[key]);
  if (changed.length) await enqueueDeviceEvent(tx, event, after, changed);
  return after;
}

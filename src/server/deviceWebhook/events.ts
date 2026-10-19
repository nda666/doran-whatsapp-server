import { randomUUID } from "node:crypto";
import type { Phone, Prisma } from "@prisma/client";

export function deviceSnapshot(phone: Phone) {
  return {
    id: phone.id, user_id: phone.userId, name: phone.name, number: phone.number,
    account_name: phone.account_name, active: phone.active, token: phone.token,
    is_save_group: phone.is_save_group, webhook_url: phone.webhookUrl,
    read_receipt: phone.readReceipt, reject_call: phone.rejectCall,
    show_online: phone.showOnline, show_typing: phone.showTyping,
    save_incoming_messages: phone.saveIncomingMessages,
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
  // Consistent lock order also serializes bulk token changes with individual edits.
  await tx.$queryRaw`SELECT id FROM device_webhook_settings WHERE id = 1 FOR UPDATE`;
  let before = await tx.phone.findFirst({ where });
  if (!before) return null;
  await tx.$queryRaw`SELECT id FROM phones WHERE id = ${before.id} FOR UPDATE`;
  before = await tx.phone.findFirst({ where });
  if (!before) return null;
  await tx.phone.updateMany({ where: { ...where, id: before.id }, data });
  const after = await tx.phone.findUniqueOrThrow({ where: { id: before.id } });
  const old = deviceSnapshot(before), next = deviceSnapshot(after);
  const changed = (Object.keys(next) as Array<keyof typeof next>).filter(key => old[key] !== next[key]);
  if (changed.length) await enqueueDeviceEvent(tx, event, after, changed);
  return after;
}

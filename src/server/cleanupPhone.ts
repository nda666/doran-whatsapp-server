import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { prisma } from "../lib/prisma";
import type { PhoneCleanupOptions } from "../lib/phoneCleanup";
import { session, waitForAuthSave, waitForPendingSocket } from "./libs/makeWASocket";
import { phoneMaintenance, retiredSockets } from "./libs/phoneMaintenance";
import { clearPhoneReconnect } from "./events/connectionUpdate";
import { clearPairingProgress } from "./libs/pairingState";
import { enqueueDeviceEvent } from "./deviceWebhook/events";
import { chatMediaPath } from "./chat/media";

export class PhoneCleanupError extends Error {
  constructor(message: string, public status = 409) { super(message); }
}

// Validate the resolved target before any recursive removal, including symlinks.
export async function authFolderTarget(userId: string, phoneId: string) {
  if (!/^[a-zA-Z0-9_-]+$/.test(userId) || !/^[a-zA-Z0-9_-]+$/.test(phoneId)) throw new PhoneCleanupError("ID perangkat tidak valid.", 400);
  const root = path.resolve(process.env.WHATSAPP_AUTH_FOLDER || "./storage/whatsapp-auth");
  const target = path.resolve(root, `${userId}-${phoneId}`);
  if (path.dirname(target) !== root) throw new PhoneCleanupError("Folder autentikasi tidak valid.", 400);
  try {
    const stat = await fs.lstat(target);
    const actualRoot = await fs.realpath(root), actualTarget = await fs.realpath(target);
    if (stat.isSymbolicLink() || !stat.isDirectory() || path.dirname(actualTarget) !== actualRoot) throw new PhoneCleanupError("Folder autentikasi tidak aman untuk dibersihkan.", 400);
  } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  return target;
}

export async function cleanupPhone(id: string, scope: { userId?: string }, options: PhoneCleanupOptions) {
  const phone = await prisma.phone.findFirst({ where: { id, ...scope } });
  if (!phone) throw new PhoneCleanupError("Data tidak ditemukan.", 404);
  if (phoneMaintenance.has(id)) throw new PhoneCleanupError("Perangkat sedang dibersihkan. Tunggu hingga selesai.");
  phoneMaintenance.add(id);
  let suspended = false;
  const cleanupLease = randomUUID();
  let leaseAcquired = false;
  const chatFiles: string[] = [];
  try {
    const authTarget = options.clearAuth ? await authFolderTarget(phone.userId, id) : undefined;
    // Do not remove records while an already claimed message is being sent.
    await prisma.waSenderLease.upsert({ where: { phoneId: id }, create: { phoneId: id }, update: {} });
    const acquired = await prisma.waSenderLease.updateMany({ where: { phoneId: id,
      OR: [{ leaseUntil: null }, { leaseUntil: { lt: new Date() } }] },
      data: { leaseToken: cleanupLease, leaseUntil: new Date(Date.now() + 300_000) } });
    leaseAcquired = acquired.count === 1;
    if (!leaseAcquired || await prisma.waDispatch.count({ where: { phoneId: id, status: "PROCESSING" } }) || await prisma.chatMessage.count({ where: { conversation: { phoneId: id }, status: "SENDING", createdAt: { gt: new Date(Date.now() - 60000) } } })) {
      throw new PhoneCleanupError("Masih ada pengiriman yang diproses. Tunggu selesai lalu coba kembali.");
    }
    await prisma.phone.update({ where: { id }, data: { active: 0 } });
    suspended = true;
    await waitForPendingSocket(phone.userId, id);
    clearPhoneReconnect(id);
    if (options.disconnect) {
      const socket = session.get(id);
      if (socket) {
        retiredSockets.add(socket);
        // Detach incoming events before deleting contacts or auto-replies.
        socket.ev.removeAllListeners("contacts.upsert");
        socket.ev.removeAllListeners("contacts.update");
        socket.ev.removeAllListeners("messages.upsert");
        let timer: NodeJS.Timeout | undefined;
        try {
          if (options.clearAuth && socket.user && socket.ws.isOpen) {
            await Promise.race([socket.logout(), new Promise<never>((_, reject) => {
              timer = setTimeout(() => reject(new PhoneCleanupError("Logout WhatsApp belum berhasil. Perangkat dinonaktifkan; coba kembali.")), 15_000);
            })]);
          }
        } finally {
          if (timer) clearTimeout(timer);
          socket.end(new Error("DEVICE_CLEANUP"));
          session.delete(id);
          await waitForAuthSave(socket);
          socket.ev.removeAllListeners("creds.update");
        }
      }
      clearPairingProgress(id);
    }
    if (authTarget) await fs.rm(authTarget, { recursive: true, force: true });
    await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM device_webhook_settings WHERE id = 1 FOR UPDATE`;
      await tx.$queryRaw`SELECT id FROM phones WHERE id = ${id} FOR UPDATE`;
      const current = await tx.phone.findFirst({ where: { id, ...scope } });
      if (!current) throw new PhoneCleanupError("Data tidak ditemukan.", 404);
      if (options.clearContacts) await tx.deviceContact.deleteMany({ where: { phoneId: id, userId: phone.userId } });
      if (options.clearHistory) {
        await tx.$queryRaw`SELECT id FROM dispatch_webhook_settings WHERE id = 1 FOR UPDATE`;
        await tx.$executeRaw`DELETE events FROM dispatch_webhook_events events
          INNER JOIN wa_dispatches jobs ON jobs.id = events.dispatchId
          WHERE jobs.phoneId = ${id} AND jobs.userId = ${phone.userId}`;
        await tx.waDispatch.deleteMany({ where: { phoneId: id, userId: phone.userId } });
        await tx.waSenderLease.deleteMany({ where: { phoneId: id } });
      }
      if (options.clearAutoReplies) await tx.autoReply.deleteMany({ where: { phoneId: id, userId: phone.userId } });
      if (options.clearHistory || options.deleteRecord) {
        const media = await tx.chatMessage.findMany({ where: { conversation: { phoneId: id, userId: phone.userId }, mediaPath: { not: null } }, select: { mediaPath: true } });
        chatFiles.push(...media.flatMap(row => row.mediaPath ? [row.mediaPath] : []));
        await tx.chatConversation.deleteMany({ where: { phoneId: id, userId: phone.userId } });
      }
      if (options.deleteRecord) {
        await tx.phone.delete({ where: { id } });
        await enqueueDeviceEvent(tx, "device.deleted", current);
      } else {
        const updated = await tx.phone.update({ where: { id }, data: {
          active: options.disconnect ? (options.clearAuth ? 1 : 0) : phone.active,
          ...(options.disconnect ? { isOnline: false, status: "CLOSE" as const, qrCode: null,
            ...(current.isOnline ? { lastOfflineAt: new Date() } : {}),
          } : {}),
          ...(options.clearAuth ? { number: null, account_name: null, qrCode: null } : {}),
          ...(options.resetToken ? { token: randomUUID() } : {}),
          ...(options.resetSettings ? { is_save_group: false, webhookUrl: null,
            readReceipt: false, rejectCall: false, showOnline: current.channel !== "telegram", showTyping: false, autoReplyEnabled: false, saveIncomingMessages: false, saveIncomingSince: null,
          } : {}),
        } });
        await enqueueDeviceEvent(tx, "device.updated", updated);
      }
    });
    await Promise.all(chatFiles.map(file => fs.unlink(chatMediaPath(file)).catch(() => {})));
    return { result: true, deleted: options.deleteRecord };
  } catch (error) {
    // A partial cleanup must not reconnect with credentials that may be gone.
    if (suspended && options.disconnect) {
      await prisma.phone.updateMany({ where: { id, ...scope, isOnline: true }, data: { lastOfflineAt: new Date(), isOnline: false, status: "CLOSE" } });
      await prisma.phone.updateMany({ where: { id, ...scope }, data: { active: 0, isOnline: false, status: "CLOSE" } });
    }
    else if (suspended) await prisma.phone.updateMany({ where: { id, ...scope }, data: { active: phone.active } });
    throw error;
  } finally {
    try {
      if (leaseAcquired) await prisma.waSenderLease.updateMany({ where: { phoneId: id, leaseToken: cleanupLease }, data: { leaseToken: null, leaseUntil: null } });
    } finally { phoneMaintenance.delete(id); }
  }
}

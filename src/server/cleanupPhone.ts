import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { prisma } from "../lib/prisma";
import type { PhoneCleanupOptions } from "../lib/phoneCleanup";
import { Prisma } from "@prisma/client";
import { session, waitForAuthSave, waitForPendingSocket } from "./libs/makeWASocket";
import { phoneMaintenance, retiredSockets } from "./libs/phoneMaintenance";
import { clearPhoneReconnect } from "./events/connectionUpdate";
import { clearPairingProgress } from "./libs/pairingState";
import { clearDatabaseAuth, closeDatabaseAuth } from "./libs/waAuthState";
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

export async function cleanupPhone(id: string, scope: Prisma.PhoneWhereInput, options: PhoneCleanupOptions) {
  const phone = await prisma.phone.findFirst({ where: { id, ...scope } });
  if (!phone) throw new PhoneCleanupError("Data tidak ditemukan.", 404);
  if (phoneMaintenance.has(id)) throw new PhoneCleanupError("Perangkat sedang dibersihkan. Tunggu hingga selesai.");
  phoneMaintenance.add(id);
  let suspended = false;
  const cleanupLease = randomUUID();
  let leaseAcquired = false;
  const renewLease = async () => {
    const renewed = await prisma.waSenderLease.updateMany({ where: { phoneId: id, leaseToken: cleanupLease, leaseUntil: { gt: new Date() } },
      data: { leaseUntil: new Date(Date.now() + 300_000) } });
    if (renewed.count !== 1) throw new PhoneCleanupError("Kunci pembersihan berakhir. Ulangi pembersihan perangkat.");
  };
  const batch = async <T,>(work: (tx: Prisma.TransactionClient) => Promise<T>) => {
    await renewLease();
    return prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM phones WHERE id = ${id} FOR UPDATE`;
      if (!await tx.phone.findFirst({ where: { id, ...scope } })) throw new PhoneCleanupError("Data tidak ditemukan.", 404);
      return work(tx);
    }, { maxWait: 10_000, timeout: 120_000 });
  };
  try {
    const authTarget = options.clearAuth ? await authFolderTarget(phone.userId, id) : undefined;
    // Do not remove records while an already claimed message is being sent.
    await prisma.waSenderLease.upsert({ where: { phoneId: id }, create: { phoneId: id }, update: {} });
    const acquired = await prisma.waSenderLease.updateMany({ where: { phoneId: id,
      OR: [{ leaseUntil: null }, { leaseUntil: { lt: new Date() } }] },
      data: { leaseToken: cleanupLease, leaseUntil: new Date(Date.now() + 300_000) } });
    leaseAcquired = acquired.count === 1;
    if (!leaseAcquired || await prisma.waDispatch.count({ where: { OR: [{ phoneId: id }, { senderPhoneId: id }], status: "PROCESSING" } }) || await prisma.chatMessage.count({ where: { conversation: { phoneId: id }, status: "SENDING", createdAt: { gt: new Date(Date.now() - 60000) } } })) {
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
          try { await waitForAuthSave(socket); }
          catch (error) { if (!options.clearAuth) throw error; }
          try { await closeDatabaseAuth(id); }
          catch (error) { if (!options.clearAuth) throw error; }
          socket.ev.removeAllListeners("creds.update");
        }
      }
      clearPairingProgress(id);
    }
    if (options.clearAuth || options.deleteRecord) await clearDatabaseAuth(id, renewLease);
    if (authTarget) await fs.rm(authTarget, { recursive: true, force: true });
    // Commit bounded batches before taking the global device-webhook lock.
    // An interrupted cleanup leaves this device inactive and can be retried.
    if (options.clearContacts) while (await batch(async tx => {
      const rows = await tx.deviceContact.findMany({ where: { phoneId: id, userId: phone.userId }, select: { id: true }, take: 200 });
      if (rows.length) await tx.deviceContact.deleteMany({ where: { phoneId: id, userId: phone.userId, id: { in: rows.map(row => row.id) } } });
      return rows.length;
    })) {}
    if (options.clearHistory) while (await batch(async tx => {
      const rows = await tx.waDispatch.findMany({ where: { phoneId: id, userId: phone.userId }, select: { id: true }, orderBy: { id: "asc" }, take: 50 });
      if (!rows.length) return 0;
      const ids = rows.map(row => row.id);
      // Status writers lock each job before emitting its outbox entry. Lock
      // these same jobs in PK order so a late receipt cannot orphan an event,
      // without waiting on the global webhook configuration mutex.
      await tx.$queryRaw(Prisma.sql`SELECT id FROM wa_dispatches WHERE id IN (${Prisma.join(ids)}) ORDER BY id FOR UPDATE`);
      await tx.dispatchWebhookEvent.deleteMany({ where: { dispatchId: { in: ids } } });
      await tx.waDispatch.deleteMany({ where: { phoneId: id, userId: phone.userId, id: { in: ids } } });
      return rows.length;
    })) {}
    if (options.clearAutoReplies) while (await batch(async tx => {
      const rows = await tx.autoReply.findMany({ where: { phoneId: id, userId: phone.userId }, select: { id: true }, take: 200 });
      if (rows.length) await tx.autoReply.deleteMany({ where: { phoneId: id, userId: phone.userId, id: { in: rows.map(row => row.id) } } });
      return rows.length;
    })) {}
    if (options.clearHistory || options.deleteRecord) {
      while (await batch(async tx => {
        const rows = await tx.waProtocolMessage.findMany({ where: { phoneId: id }, select: { keyHash: true }, take: 200 });
        if (rows.length) await tx.waProtocolMessage.deleteMany({ where: { phoneId: id, keyHash: { in: rows.map(row => row.keyHash) } } });
        return rows.length;
      })) {}
      while (true) {
        const rows = await batch(async tx => {
          const messages = await tx.chatMessage.findMany({ where: { conversation: { phoneId: id, userId: phone.userId } }, select: { id: true, mediaPath: true }, take: 200 });
          if (messages.length) await tx.chatMessage.deleteMany({ where: { id: { in: messages.map(row => row.id) }, conversation: { phoneId: id, userId: phone.userId } } });
          return messages;
        });
        if (!rows.length) break;
        await Promise.all(rows.map(row => row.mediaPath ? fs.unlink(chatMediaPath(row.mediaPath)).catch(() => {}) : undefined));
      }
      while (await batch(async tx => {
        const rows = await tx.chatConversation.findMany({ where: { phoneId: id, userId: phone.userId }, select: { id: true }, take: 200 });
        if (rows.length) await tx.chatConversation.deleteMany({ where: { phoneId: id, userId: phone.userId, id: { in: rows.map(row => row.id) } } });
        return rows.length;
      })) {}
    }
    await renewLease();
    await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM device_webhook_settings WHERE id = 1 FOR UPDATE`;
      await tx.$queryRaw`SELECT id FROM phones WHERE id = ${id} FOR UPDATE`;
      const current = await tx.phone.findFirst({ where: { id, ...scope } });
      if (!current) throw new PhoneCleanupError("Data tidak ditemukan.", 404);
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
      if (options.clearHistory || options.deleteRecord) await tx.waSenderLease.deleteMany({ where: { phoneId: id, leaseToken: cleanupLease } });
    }, { maxWait: 10_000, timeout: 60_000 });
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

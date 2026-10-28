import * as fs from "fs";
import { join } from "path";

import {
  ConnectionState,
  DisconnectReason,
  WASocket,
} from "@whiskeysockets/baileys";

import { prisma } from "../../lib/prisma";
import { WaSockQrTimeout } from "../constant";
import makeWASocket, { deleteSession, getAllSession, waitForAuthSave } from "../libs/makeWASocket";
import { emitDeviceEvent } from "../libs/socket";
import { recordPairingProgress } from "../libs/pairingState";
import { updateDevice } from "../deviceWebhook/events";
import { phoneMaintenance, retiredSockets } from "../libs/phoneMaintenance";
import { waRecovery } from "../libs/waRecoveryState";
import { acceptsPairingIdentity, rejectedPairings } from "../libs/pairingIdentity";

const reconnectAttempts = waRecovery.attempts;
const reconnectTimers = waRecovery.timers;

export function stopReconnectTimers() {
  for (const timer of Array.from(reconnectTimers.values())) clearTimeout(timer);
  reconnectTimers.clear();
  reconnectAttempts.clear();
}

export default async function connectionUpdate(
  waSock: WASocket,
  userId: string,
  phoneId: string,
  update: Partial<ConnectionState>
) {
  if (phoneMaintenance.has(phoneId) || retiredSockets.has(waSock)) return;
  if (process.env.DORAN_SHUTTING_DOWN === "true") return;
  const current = getAllSession().get(phoneId);
  if (current && current !== waSock) return;
  if (waSock.user && !acceptsPairingIdentity(waSock)) {
    await rejectPairingIdentity(waSock, userId, phoneId);
    return;
  }
  // Baileys emits isNewLogin after successful QR pairing, before the required
  // socket restart. Ordinary reconnects and QR generation must not change it.
  if (update.isNewLogin) {
    const lastQrScanAt = new Date();
    try {
      await prisma.phone.update({ where: { id: phoneId }, data: { lastQrScanAt } });
      await emitDeviceEvent(phoneId, "qrScanned", { phoneId, lastQrScanAt: lastQrScanAt.toISOString() });
    } catch (error) {
      console.error("WA_QR_SCAN_PERSIST_FAILED", phoneId, error instanceof Error ? error.message : "Unknown error");
    }
  }
  const phase = recordPairingProgress(phoneId, update);
  if (phase && phase !== "qr") await emitDeviceEvent(phoneId, "connectionState", {
    phoneId,
    connection: phase === "connected" ? "open" : phase === "error" ? "close" : "pairing",
    status: (update.lastDisconnect?.error as any)?.output?.statusCode,
  });
  if (waSock.user) {
    await emitDeviceEvent(phoneId, "waUser", { phoneId, waUser: waSock.user });
  }

  if (update.qr) {
    await emitDeviceEvent(phoneId, "qr", {
      phoneId,
      qr: update.qr,
      timeout: WaSockQrTimeout,
    });
    // await prisma.phone.update({
    //   where: {
    //     id: phoneId,
    //   },
    //   data: {
    //     qrCode: update.qr,
    //   },
    // });
  }

  const { connection, lastDisconnect } = update;
  if (connection === "open" || connection === "close") {
    console.info("WA_CONNECTION_STATE", JSON.stringify({ phoneId, connection, status: (lastDisconnect?.error as any)?.output?.statusCode }));
    // Device connectivity is independent of WhatsApp presence/showOnline.
    // Persist before notifying clients so their refetch sees the new state.
    const isOnline = connection === "open";
    let persisted = false;
    try {
      await prisma.$transaction(async tx => {
        // Only the transition from online starts a new offline period.
        // Failed reconnects must preserve the original time.
        if (!isOnline) await tx.phone.updateMany({
          where: { id: phoneId, isOnline: true },
          data: { isOnline: false, status: "CLOSE", lastOfflineAt: new Date() },
        });
        await tx.phone.update({ where: { id: phoneId }, data: { isOnline, status: isOnline ? "OPEN" : "CLOSE" } });
      });
      persisted = true;
    } catch (error) {
      // A database outage must not prevent transport recovery.
      console.error("WA_CONNECTION_PERSIST_FAILED", phoneId, error instanceof Error ? error.message : "Unknown error");
    }
    if (getAllSession().get(phoneId) && getAllSession().get(phoneId) !== waSock) return;
    if (persisted) await emitDeviceEvent(phoneId, "isOnline", { phoneId, isOnline });
  }
  if (connection === "open") {
    waRecovery.disconnects?.delete(phoneId);
    waRecovery.blocked.delete(phoneId);
    const health = waRecovery.sockets.get(waSock);
    if (health) health.connected = true;
    reconnectAttempts.delete(phoneId);
    const pending = reconnectTimers.get(phoneId);
    if (pending) clearTimeout(pending);
    reconnectTimers.delete(phoneId);
    const waUser = waSock.user;
    if (waUser) await prisma.$transaction(tx => updateDevice(tx, { id: phoneId, userId }, {
      number: waUser.id.split(":")[0].split("@")[0], account_name: waUser.name,
    }));
  }
  if (connection === "close") {
    const status = (lastDisconnect?.error as any)?.output?.statusCode;
    waRecovery.disconnects?.set(phoneId, { code: status, at: Date.now() });
    retiredSockets.add(waSock);
    deleteSession(phoneId);
    const pending = reconnectTimers.get(phoneId);
    if (pending) clearTimeout(pending);
    reconnectTimers.delete(phoneId);

    // reconnect if not logged out
    if (
      (lastDisconnect?.error as any)?.output?.statusCode ==
      DisconnectReason.loggedOut
    ) {
      waRecovery.blocked.add(phoneId);
      fs.rmSync(join(process.env.WHATSAPP_AUTH_FOLDER || "./storage/whatsapp-auth", `${userId}-${phoneId}`), {
        recursive: true,
        force: true,
      });
      reconnectAttempts.delete(phoneId);
      return;
    }
    if (process.env.WHATSAPP_ENABLED === "false" ||
        status === DisconnectReason.connectionReplaced ||
        status === DisconnectReason.badSession ||
        status === DisconnectReason.forbidden ||
        status === DisconnectReason.multideviceMismatch) {
      waRecovery.blocked.add(phoneId);
      return;
    }
    // Expired QR sessions need a user scan, not an endless background QR loop.
    if (!waSock.authState?.creds.me?.id && status !== DisconnectReason.restartRequired) return;
    const attempts = (reconnectAttempts.get(phoneId) || 0) + 1;
    reconnectAttempts.set(phoneId, attempts);
    const delay = status === DisconnectReason.restartRequired ? 500 : Math.min(60_000, 2_000 * 2 ** Math.min(attempts - 1, 5));
    const timer = setTimeout(() => {
      reconnectTimers.delete(phoneId);
      if (process.env.WHATSAPP_ENABLED === "false" || process.env.DORAN_SHUTTING_DOWN === "true") return;
      waitForAuthSave(waSock).then(() => {
        if (phoneMaintenance.has(phoneId) || waRecovery.blocked.has(phoneId) || process.env.DORAN_SHUTTING_DOWN === "true") return;
        return makeWASocket(userId, phoneId);
      }).catch(error => {
        console.error("WhatsApp reconnect failed:", error.message);
      });
    }, delay);
    timer.unref();
    reconnectTimers.set(phoneId, timer);
  }
}

export async function rejectPairingIdentity(socket: WASocket, userId: string, phoneId: string) {
  if (retiredSockets.has(socket)) return;
  rejectedPairings.add(phoneId);
  retiredSockets.add(socket);
  waRecovery.blocked.add(phoneId);
  if (getAllSession().get(phoneId) === socket) deleteSession(phoneId);
  clearPhoneReconnect(phoneId);
  // Retire synchronously before any I/O; every outgoing send also checks identity.
  socket.end(new Error("SENDER_NUMBER_MISMATCH"));
  try {
    await prisma.$transaction(tx => updateDevice(tx, { id: phoneId, userId }, {
      active: 0, isOnline: false, status: "CLOSE", lastOfflineAt: new Date(),
    }, "device.active_changed"));
  } catch {
    console.error("WA_IDENTITY_REJECTION_PERSIST_FAILED", phoneId);
  }
  console.error("WA_PAIRING_NUMBER_MISMATCH", phoneId);
}

export function clearPhoneReconnect(phoneId: string) {
  const timer = reconnectTimers.get(phoneId);
  if (timer) clearTimeout(timer);
  reconnectTimers.delete(phoneId);
  reconnectAttempts.delete(phoneId);
}

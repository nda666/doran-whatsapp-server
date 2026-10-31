import "pino-pretty";
import { captureStop, reserveSend, recipientBlocked, SendGuardError } from "../messaging/safety";
import { serializeTransport, markLegacyTransportStarted } from "../messaging/transportSafety";
import { assertSendFence } from "../messaging/sendFence";

import pino from "pino";

import _makeWASocket, {
  WASocket,
} from "@whiskeysockets/baileys";

import { prisma } from "../../lib/prisma";
import { getWaMesage } from "../../server/utils/getWaMessage";
import { getPhoneById } from "../../services/phone";
import { WaSockQrTimeout } from "../constant";
import connectionUpdate, { rejectPairingIdentity } from "../events/connectionUpdate";
import { acceptsPairingIdentity, bindPairingIdentity, rejectedPairings } from "./pairingIdentity";
import { handleMessageInEvent } from "../events/handleMessageInEvent";
import { handleQuotedMessageEvent } from "../events/handleQuotedMessageEvent";
import { safeLinkPreview } from "../utils/safeLinkPreview";
import { recordQrState } from "./qrState";
import { recordDispatchReceipt } from "../dispatch/receipts";
import { cacheDeviceContacts } from "../campaigns/contacts";
import { sendDeviceWebhook } from "../utils/sendDeviceWebhook";
import { updateDevice } from "../deviceWebhook/events";
import { phoneMaintenance, retiredSockets } from "./phoneMaintenance";
import { waRecovery } from "./waRecoveryState";
import { captureChatMessage, recordChatReceipt } from "../chat/store";
import { createDatabaseAuthState, closeDatabaseAuth } from "./waAuthState";
import { groupMetadataCache, getProtocolMessage, storeProtocolMessage } from "./waMessageStore";
import { recordRestriction, refreshRestrictions, requireUnrestricted } from "../messaging/restrictions";

const shared = globalThis as typeof globalThis & {
  doranWaSessions?: Map<string, WASocket>;
  doranPendingWaSockets?: Map<string, Promise<WASocket>>;
  doranAuthWrites?: WeakMap<WASocket, Promise<void>>;
};
// Custom server and Next.js API bundles must reuse the same device sockets.
export const session = shared.doranWaSessions || (shared.doranWaSessions = new Map<string, WASocket>());
const pendingSockets = shared.doranPendingWaSockets || (shared.doranPendingWaSockets = new Map<string, Promise<WASocket>>());
const authWrites = shared.doranAuthWrites || (shared.doranAuthWrites = new WeakMap<WASocket, Promise<void>>());
export const waitForAuthSave = (socket: WASocket) => authWrites.get(socket) || Promise.resolve();

const waSocketLogOption = pino({
  enabled: true,
  level: "error",
}) as any;

const createWASocket = async (
  userId: string,
  phoneId: string,
  replaceState = false
): Promise<WASocket> => {
  if (process.env.WHATSAPP_ENABLED === "false") {
    throw new Error("Koneksi WhatsApp dinonaktifkan sementara.");
  }
  const phone = await getPhoneById(phoneId);
  if (phone?.channel === "telegram") throw new Error("Perangkat Telegram menggunakan API provider; sesi WhatsApp tidak tersedia.");
  if (!phone || phone.userId !== userId || phone.active !== 1) {
    throw new Error(`Device ${phoneId} is not active`);
  }
  const existing = session.get(phoneId);
  if (existing && !replaceState && !existing.ws.isClosed && !existing.ws.isClosing) {
    bindPairingIdentity(existing, phone.number);
    if (existing.user && !acceptsPairingIdentity(existing)) {
      await rejectPairingIdentity(existing, userId, phoneId);
      throw new Error("SENDER_NUMBER_MISMATCH");
    }
    return existing;
  }
  if (existing) {
    retiredSockets.add(existing);
    session.delete(phoneId);
    existing.end(new Error("WA_SOCKET_REPLACED"));
    await waitForAuthSave(existing);
  }

  let _waSocket = {} as WASocket;
  const auth = await createDatabaseAuthState(phoneId,
    `${process.env.WHATSAPP_AUTH_FOLDER || "./storage/whatsapp-auth"}/${userId}-${phoneId}`,
    () => {
      if (_waSocket.end) {
        retiredSockets.add(_waSocket);
        _waSocket.end(new Error("WA_AUTH_LEASE_LOST"));
        if (session.get(phoneId) === _waSocket) session.delete(phoneId);
      }
    });
  const { state, saveCreds } = auth;

  if (session.get(phoneId) && !replaceState) {
    _waSocket = session.get(phoneId)!;
  } else {
    // const webVersion = await fetchLatestWaWebVersion({});
    const groups = groupMetadataCache(() => _waSocket);
    try { _waSocket = await _makeWASocket({
      // logger: waSocketLogOption,
      logger: pino({ level: "silent" }),
      auth: state,
      shouldSyncHistoryMessage: (m) => false,
      syncFullHistory: false,
      markOnlineOnConnect: phone.showOnline,
      qrTimeout: WaSockQrTimeout,
      getMessage: async key => {
        const message = await getProtocolMessage(phoneId, key);
        if (message || !key.remoteJid?.endsWith("@lid")) return message;
        const pn = await _waSocket.signalRepository.lidMapping.getPNForLID(key.remoteJid);
        return pn ? getProtocolMessage(phoneId, { ...key, remoteJid: pn }) : undefined;
      },
      cachedGroupMetadata: jid => groups.get(jid),
    }); } catch (error) { await auth.close(); throw error; }
    _waSocket.ev.on("groups.update", updates => { for (const group of updates) if (group.id) groups.invalidate(group.id); });
    _waSocket.ev.on("group-participants.update", update => groups.invalidate(update.id));
    bindPairingIdentity(_waSocket, phone.number);
    rejectedPairings.delete(phoneId);
    waRecovery.blocked.delete(phoneId);
    waRecovery.sockets.set(_waSocket, { createdAt: Date.now(), connected: false });
    session.set(phoneId, _waSocket);
    const restrictionTimer = setInterval(() => {
      if (!retiredSockets.has(_waSocket) && session.get(phoneId) === _waSocket && _waSocket.ws.isOpen && _waSocket.user) {
        refreshRestrictions(phoneId, _waSocket).catch(() => console.error("WA_RESTRICTION_QUERY_FAILED", phoneId));
      }
    }, 300_000);
    restrictionTimer.unref();
    const sendMessage = _waSocket.sendMessage.bind(_waSocket);
    _waSocket.ev.on("contacts.upsert", contacts => {
      cacheDeviceContacts(userId, phoneId, contacts).catch(() => console.error("CONTACT_SYNC_FAILED"));
    });
    _waSocket.ev.on("contacts.update", contacts => {
      cacheDeviceContacts(userId, phoneId, contacts).catch(() => console.error("CONTACT_SYNC_FAILED"));
    });
    _waSocket.ev.on("call", calls => {
      prisma.phone.findFirst({ where: { id: phoneId, userId } }).then(async current => {
        if (!current?.rejectCall) return;
        for (const call of calls) if (call.status === "offer") await _waSocket.rejectCall(call.id, call.from);
      }).catch(() => console.error("CALL_REJECTION_FAILED"));
    });
    const requireSenderIdentity = () => {
      if (retiredSockets.has(_waSocket) || session.get(phoneId) !== _waSocket || !acceptsPairingIdentity(_waSocket)) throw new SendGuardError("SENDER_NUMBER_MISMATCH");
    };
    _waSocket.sendMessage = (jid, content, options) => serializeTransport(phoneId, async () => {
      await assertSendFence();
      requireSenderIdentity();
      await auth.assertOwned();
      await requireUnrestricted(phoneId, _waSocket);
      const generationOptions = { ...options, getUrlInfo: safeLinkPreview };
      const guardJid = jid.endsWith("@lid") ? await _waSocket.signalRepository.lidMapping.getPNForLID(jid) : jid;
      if (!guardJid) throw new SendGuardError("RECIPIENT_ID_UNRESOLVED");
      const day = await reserveSend(userId, phoneId, guardJid);
      if (guardJid.endsWith("@s.whatsapp.net") && await recipientBlocked(userId, guardJid.split("@")[0].split(":")[0])) throw new SendGuardError("RECIPIENT_OPTED_OUT");
      let result;
      requireSenderIdentity();
      await auth.assertOwned();
      await assertSendFence();
      markLegacyTransportStarted();
      try { result = await sendMessage(jid, content, generationOptions); }
      catch (error) {
        await prisma.deviceDailyUsage.update({ where: { phoneId_day: { phoneId, day } }, data: { failures: { increment: 1 } } }).catch(() => console.error("SEND_FAILURE_COUNT_FAILED"));
        throw error;
      }
      if (result) await captureChatMessage(phoneId, result, _waSocket).catch(() => console.error("CHAT_OUTGOING_SAVE_FAILED", phoneId));
      if (result) await storeProtocolMessage(phoneId, result).catch(() => console.error("WA_PROTOCOL_SAVE_FAILED", phoneId));
      return result;
    });

    // console.info("CREATE new session: " + phoneId);
    _waSocket.ev.on("creds.update", (authState) => {
      const saving = saveCreds();
      authWrites.set(_waSocket, saving);
      saving.catch(error => console.error("Auth state save failed:", error.message));
    });
    _waSocket.ev.on("messages.update", updates => {
      for (const { key, update } of updates) if (key.fromMe && key.id && typeof update.status === "number") {
        recordChatReceipt(phoneId, key.id, update.status).catch(() => console.error("CHAT_RECEIPT_FAILED", phoneId));
      }
      if (process.env.DISPATCH_QUEUE_ENABLED !== "true") return;
      for (const { key, update } of updates) if (key.fromMe && key.id && typeof update.status === "number") {
        recordDispatchReceipt(phoneId, key.id, update.status).catch(() => console.error("DISPATCH_RECEIPT_FAILED"));
      }
    });
    _waSocket.ev.on("message-receipt.update", updates => {
      for (const { key, receipt } of updates) if (key.fromMe && key.id) {
        const level = receipt.readTimestamp || receipt.playedTimestamp ? 4 : receipt.receiptTimestamp ? 3 : 0;
        if (level) recordChatReceipt(phoneId, key.id, level).catch(() => console.error("CHAT_RECEIPT_FAILED", phoneId));
      }
      if (process.env.DISPATCH_QUEUE_ENABLED !== "true") return;
      for (const { key, receipt } of updates) if (key.fromMe && key.id) {
        const level = receipt.readTimestamp || receipt.playedTimestamp ? 4 : receipt.receiptTimestamp ? 3 : 0;
        if (level) recordDispatchReceipt(phoneId, key.id, level).catch(() => console.error("DISPATCH_RECEIPT_FAILED"));
      }
    });

    // return _waSocket;
    _waSocket.ev.on("connection.update", async (update) => {
      if (update.reachoutTimeLock && session.get(phoneId) === _waSocket && !retiredSockets.has(_waSocket)) {
        recordRestriction(phoneId, update.reachoutTimeLock).catch(() => console.error("WA_RESTRICTION_SAVE_FAILED", phoneId));
      }
      if (update.connection === "open") refreshRestrictions(phoneId, _waSocket).catch(() => console.error("WA_RESTRICTION_QUERY_FAILED", phoneId));
      if (update.connection === "close") {
        clearInterval(restrictionTimer);
        const closing = waitForAuthSave(_waSocket).finally(() => auth.close());
        authWrites.set(_waSocket, closing);
        closing.catch(() => console.error("WA_AUTH_CLOSE_FAILED", phoneId));
      }
      recordQrState(_waSocket, update, WaSockQrTimeout);
      connectionUpdate(_waSocket, userId, phoneId, update).catch(error => {
        console.error("WhatsApp connection update failed:", error.message);
      });
    });

    // onCreated && onCreated(_waSocket);

    // for reply
    _waSocket.ev.on("messages.upsert", async ({ messages: batch, type }) => {
      if (phoneMaintenance.has(phoneId) || retiredSockets.has(_waSocket) || !acceptsPairingIdentity(_waSocket)) return;
      if (process.env.DORAN_SHUTTING_DOWN === "true") return;
      // Honor STOP before media storage, webhook calls or auto replies can delay the batch.
      const optedOutMessages = new Set<(typeof batch)[number]>();
      for (const incoming of batch) {
        if (incoming.key.fromMe) continue;
        const { messageIn } = getWaMesage([incoming]);
        if (!messageIn || !/^\s*(STOP|BERHENTI|UNSUBSCRIBE)[.!\s]*$/i.test(messageIn)) continue;
        const jid = incoming.key.remoteJid || "";
        const senderJid = jid.endsWith("@lid") ? incoming.key.remoteJidAlt || await _waSocket.signalRepository.lidMapping.getPNForLID(jid) || jid : jid;
        try { if (await captureStop(userId, senderJid, messageIn)) optedOutMessages.add(incoming); }
        catch { optedOutMessages.add(incoming); console.error("OPT_OUT_CAPTURE_FAILED", phoneId); }
      }
      for (const incoming of batch) await storeProtocolMessage(phoneId, incoming).catch(() => console.error("WA_PROTOCOL_SAVE_FAILED", phoneId));
      // Store every new message in a batch, including messages sent from the phone.
      if (type === "notify" || type === "append") for (const message of batch) {
        await captureChatMessage(phoneId, message, _waSocket).catch(() => console.error("CHAT_INCOMING_SAVE_FAILED", phoneId));
      }
      for (const incoming of batch) {
      if (incoming.key.fromMe) continue;
      const messages = [incoming];
      try {
      const { messageIn, messageType, quotedMessage } = getWaMesage(messages);

      const getPhone = await getPhoneById(phoneId);
      if (getPhone?.webhookUrl) {
        const url = getPhone.webhookUrl;
        sendDeviceWebhook(url, { event: "message.incoming", device_id: phoneId, sender: messages[0].key.remoteJid, recipient: getPhone.number, message: messageIn || "", message_id: messages[0].key.id })
          .then(() => prisma.inboxMessage.create({ data: { userId, sender: messages[0].key.remoteJid?.split("@")[0] || "", recipient: getPhone.number || "", message: messageIn || "", url, type_request: "POST", status: 1, respons: "WEBHOOK_OK" } }))
          .catch(async () => {
            console.error("DEVICE_WEBHOOK_FAILED");
            await prisma.inboxMessage.create({ data: { userId, sender: messages[0].key.remoteJid?.split("@")[0] || "", recipient: getPhone.number || "", message: messageIn || "", url, type_request: "POST", status: 0, respons: "WEBHOOK_FAILED" } });
          }).catch(() => console.error("WEBHOOK_LOG_FAILED"));
      }
      if (getPhone?.readReceipt && !messages[0].key.fromMe) await _waSocket.readMessages(messages.map(m => m.key));
      if (optedOutMessages.has(incoming)) continue;
      if (messageIn && !quotedMessage && getPhone) {
        await handleMessageInEvent({
          phone: getPhone,
          _waSocket: _waSocket,
          messageIn: messageIn,
          messages: messages,
          userId: userId,
          allowAi: type === "notify",
        });
      }

      if (quotedMessage && getPhone) {
        await handleQuotedMessageEvent({
          messages: messages,
          messageType: messageType,
          phone: getPhone,
          quotedMessage: quotedMessage,
          waSocket: _waSocket,
          userId,
          allowAi: type === "notify",
        });
      }
      } catch (error) {
        console.error("WhatsApp message handler failed:", error instanceof Error ? error.message : "Unknown error");
      }
      }
    });
  }

  if (_waSocket.user) {
    if (!acceptsPairingIdentity(_waSocket)) {
      await rejectPairingIdentity(_waSocket, userId, phoneId);
      throw new Error("SENDER_NUMBER_MISMATCH");
    }
    const waUser = _waSocket.user;
    await prisma.$transaction(tx => updateDevice(tx, { id: phoneId, userId }, {
        number: waUser.id.split(":")[0].split("@")[0],
        account_name: waUser.name,
      }));
  }

  return _waSocket;
};

const makeWASocket = (userId: string, phoneId: string, replaceState = false): Promise<WASocket> => {
  if (phoneMaintenance.has(phoneId)) return Promise.reject(new Error("Perangkat sedang dibersihkan."));
  if (process.env.DORAN_SHUTTING_DOWN === "true") return Promise.reject(new Error("Server sedang berhenti."));
  const key = `${userId}:${phoneId}`;
  const pending = pendingSockets.get(key);
  if (pending) return pending;
  const creating = createWASocket(userId, phoneId, replaceState).finally(() => pendingSockets.delete(key));
  pendingSockets.set(key, creating);
  return creating;
};

export const deleteSession = (phoneId: string) => {
  session.delete(phoneId);
};

export async function waitForPendingSocket(userId: string, phoneId: string) {
  await pendingSockets.get(`${userId}:${phoneId}`)?.catch(() => {});
}

export const getAllSession = () => {
  return session;
};

export async function closeWaSessions() {
  await Promise.allSettled(Array.from(pendingSockets.values()));
  await prisma.phone.updateMany({
    where: { id: { in: Array.from(session.keys()) }, isOnline: true },
    data: { isOnline: false, status: "CLOSE", lastOfflineAt: new Date() },
  }).catch(error => console.error("WA_SHUTDOWN_STATUS_FAILED", error instanceof Error ? error.message : "Unknown error"));
  const results = await Promise.allSettled(Array.from(session.entries()).map(async ([phoneId, socket]) => {
    try { await waitForAuthSave(socket); }
    finally { socket.end(new Error("SERVER_SHUTDOWN")); await closeDatabaseAuth(phoneId); }
  }));
  session.clear();
  if (results.some(result => result.status === "rejected")) throw new Error("WA_SHUTDOWN_FAILED");
}

export default makeWASocket;

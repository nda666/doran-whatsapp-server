import "pino-pretty";
import { captureStop, reserveSend, recipientBlocked, SendGuardError } from "../messaging/safety";
import { serializeTransport, markLegacyTransportStarted } from "../messaging/transportSafety";
import { assertSendFence } from "../messaging/sendFence";
import { trafficContentHash } from "../messaging/trafficGuard";
import { getTrafficPolicy } from "../dispatch/settings";

import pino from "pino";

import _makeWASocket, {
  generateMessageIDV2,
  WASocket,
} from "@whiskeysockets/baileys";

import { prisma } from "../../lib/prisma";
import { getWaMesage } from "../../server/utils/getWaMessage";
import { getPhoneById } from "../../services/phone";
import { WaSockQrTimeout } from "../constant";
import connectionUpdate, { rejectPairingIdentity, clearPhoneReconnect } from "../events/connectionUpdate";
import { ownerCanSend } from "../messaging/recipientPolicy";
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
import { claimLiveIncoming } from "../messaging/incomingDedupe";
import { getAutoReplyMaxAgeSeconds } from "../messaging/autoReplyAge";
import { autoReplyAgeAllowed } from "../../lib/autoReplyAge";
import { recordReply } from "../messaging/engagement";
import { usageDay } from "../messaging/safety";
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
  if (!await ownerCanSend(userId)) throw new SendGuardError("ACCOUNT_INACTIVE");
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
  // An admin may disable the owner while auth migration/lease acquisition is awaiting I/O.
  try { if (!await ownerCanSend(userId)) throw new SendGuardError("ACCOUNT_INACTIVE"); }
  catch (error) { await auth.close(); throw error; }

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
    const activeOwner = async () => {
      if (retiredSockets.has(_waSocket) || session.get(phoneId) !== _waSocket) return false;
      try {
        if (await ownerCanSend(userId)) return !retiredSockets.has(_waSocket) && session.get(phoneId) === _waSocket;
        await suspendWaPhone(phoneId, _waSocket);
      } catch { console.error("WA_OWNER_ACTIVITY_CHECK_FAILED", phoneId); }
      return false;
    };
    const restrictionTimer = setInterval(() => {
      if (!retiredSockets.has(_waSocket) && session.get(phoneId) === _waSocket && _waSocket.ws.isOpen && _waSocket.user) {
        activeOwner().then(async active => { if (active) await refreshRestrictions(phoneId, _waSocket); }).catch(() => console.error("WA_RESTRICTION_QUERY_FAILED", phoneId));
      }
    }, 300_000);
    restrictionTimer.unref();
    const sendMessage = _waSocket.sendMessage.bind(_waSocket);
    _waSocket.ev.on("contacts.upsert", contacts => {
      activeOwner().then(async active => { if (active) await cacheDeviceContacts(userId, phoneId, contacts); }).catch(() => console.error("CONTACT_SYNC_FAILED"));
    });
    _waSocket.ev.on("contacts.update", contacts => {
      activeOwner().then(async active => { if (active) await cacheDeviceContacts(userId, phoneId, contacts); }).catch(() => console.error("CONTACT_SYNC_FAILED"));
    });
    _waSocket.ev.on("call", calls => {
      activeOwner().then(async active => active ? prisma.phone.findFirst({ where: { id: phoneId, userId } }) : null).then(async current => {
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
      // A stable logical ID lets retries share one traffic row instead of counting as new identical content.
      const trafficPolicy = await getTrafficPolicy();
      const logicalId = trafficPolicy.enabled ? options?.messageId || generateMessageIDV2(_waSocket.user?.id) : undefined;
      const traffic = logicalId ? { logicalId, contentHash: trafficContentHash(content), policy: trafficPolicy } : undefined;
      const generationOptions = { ...options, ...(logicalId ? { messageId: logicalId } : {}), getUrlInfo: safeLinkPreview };
      const guardJid = jid.endsWith("@lid") ? await _waSocket.signalRepository.lidMapping.getPNForLID(jid) : jid;
      if (!guardJid) throw new SendGuardError("RECIPIENT_ID_UNRESOLVED");
      const day = await reserveSend(userId, phoneId, guardJid, traffic);
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
      if (update.connection === "close") {
        clearInterval(restrictionTimer);
        const closing = waitForAuthSave(_waSocket).finally(() => auth.close());
        authWrites.set(_waSocket, closing);
        closing.catch(() => console.error("WA_AUTH_CLOSE_FAILED", phoneId));
      }
      if (!await activeOwner()) return;
      if (update.connection === "open") refreshRestrictions(phoneId, _waSocket).catch(() => console.error("WA_RESTRICTION_QUERY_FAILED", phoneId));
      recordQrState(_waSocket, update, WaSockQrTimeout);
      connectionUpdate(_waSocket, userId, phoneId, update).catch(error => {
        console.error("WhatsApp connection update failed:", error.message);
      });
    });

    // onCreated && onCreated(_waSocket);

    // for reply
    _waSocket.ev.on("messages.upsert", async ({ messages: batch, type }) => {
      const receivedAt = Date.now();
      if (phoneMaintenance.has(phoneId) || retiredSockets.has(_waSocket) || !acceptsPairingIdentity(_waSocket)) return;
      if (process.env.DORAN_SHUTTING_DOWN === "true") return;
      if (!await activeOwner()) return;
      // Honor live STOP before storage/webhooks delay the batch. Replayed history cannot revoke a later re-consent.
      const optedOutMessages = new Set<(typeof batch)[number]>();
      if (type === "notify") for (const incoming of batch) {
        if (incoming.key.fromMe) continue;
        const { messageIn } = getWaMesage([incoming]);
        if (!messageIn || !/^\s*(STOP|BERHENTI|UNSUBSCRIBE)[.!\s]*$/i.test(messageIn)) continue;
        const jid = incoming.key.remoteJid || "";
        const senderJid = jid.endsWith("@lid") ? incoming.key.remoteJidAlt || await _waSocket.signalRepository.lidMapping.getPNForLID(jid) || jid : jid;
        try { if (await captureStop(userId, senderJid, messageIn, { phoneId, key: incoming.key })) optedOutMessages.add(incoming); }
        catch { optedOutMessages.add(incoming); console.error("OPT_OUT_CAPTURE_FAILED", phoneId); }
      }
      // Snapshot before storage/media work. Failure only holds auto-reply; STOP/history/webhooks remain independent.
      let autoReplyMaxAgeSeconds: number | null = null;
      if (type === "notify") {
        try { autoReplyMaxAgeSeconds = await getAutoReplyMaxAgeSeconds(); }
        catch { console.error("AUTO_REPLY_AGE_SETTING_FAILED", phoneId); }
      }
      for (const incoming of batch) await storeProtocolMessage(phoneId, incoming).catch(() => console.error("WA_PROTOCOL_SAVE_FAILED", phoneId));
      // Store every new message in a batch, including messages sent from the phone.
      if (type === "notify" || type === "append") for (const message of batch) {
        await captureChatMessage(phoneId, message, _waSocket).catch(() => console.error("CHAT_INCOMING_SAVE_FAILED", phoneId));
      }
      for (const incoming of batch) {
      if (incoming.key.fromMe) continue;
      // The same inbound message must not trigger webhooks or automatic replies twice.
      try { if (!await claimLiveIncoming(phoneId, incoming.key, type)) continue; }
      catch { console.error("INCOMING_CLAIM_FAILED", phoneId); continue; }
      if (type === "notify" && !incoming.key.remoteJid?.endsWith("@g.us")) {
        const replyJid = incoming.key.remoteJid?.endsWith("@lid") ? incoming.key.remoteJidAlt : incoming.key.remoteJid;
        recordReply(phoneId, replyJid, usageDay()).catch(() => console.error("REPLY_COUNT_FAILED", phoneId));
      }
      const messages = [incoming];
      try {
      const { messageIn, messageType, quotedMessage } = getWaMesage(messages);

      const getPhone = await getPhoneById(phoneId);
      // Storage/media may take time; recheck before starting external inbound effects.
      if (!await activeOwner()) return;
      if (getPhone?.webhookUrl) {
        const url = getPhone.webhookUrl;
        sendDeviceWebhook(url, { event: "message.incoming", device_id: phoneId, sender: messages[0].key.remoteJid, recipient: getPhone.number, message: messageIn || "", message_id: messages[0].key.id })
          .then(() => prisma.inboxMessage.create({ data: { userId, sender: messages[0].key.remoteJid?.split("@")[0] || "", recipient: getPhone.number || "", message: messageIn || "", url, type_request: "POST", status: 1, respons: "WEBHOOK_OK" } }))
          .catch(async () => {
            console.error("DEVICE_WEBHOOK_FAILED");
            await prisma.inboxMessage.create({ data: { userId, sender: messages[0].key.remoteJid?.split("@")[0] || "", recipient: getPhone.number || "", message: messageIn || "", url, type_request: "POST", status: 0, respons: "WEBHOOK_FAILED" } });
          }).catch(() => console.error("WEBHOOK_LOG_FAILED"));
      }
      // Offline sync/history ("append") must never produce read receipts or automatic replies.
      if (type !== "notify") continue;
      if (getPhone?.readReceipt && !messages[0].key.fromMe) await _waSocket.readMessages(messages.map(m => m.key));
      if (optedOutMessages.has(incoming)) continue;
      const allowAutoReply = autoReplyMaxAgeSeconds !== null && autoReplyAgeAllowed(incoming.messageTimestamp, autoReplyMaxAgeSeconds, receivedAt);
      if (messageIn && !quotedMessage && getPhone) {
        await handleMessageInEvent({
          phone: getPhone,
          _waSocket: _waSocket,
          messageIn: messageIn,
          messages: messages,
          userId: userId,
          allowAi: type === "notify",
          allowAutoReply,
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
          allowAutoReply,
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

/** Stop connectivity without logout, deleting credentials, or permanently blocking reactivation. */
export async function suspendWaPhone(phoneId: string, expectedSocket?: WASocket) {
  const socket = session.get(phoneId);
  if (expectedSocket && socket !== expectedSocket) return;
  clearPhoneReconnect(phoneId);
  if (socket) {
    retiredSockets.add(socket);
    session.delete(phoneId);
    try { socket.end(new Error("WA_OWNER_INACTIVE")); }
    finally {
      try { await waitForAuthSave(socket); }
      finally { await closeDatabaseAuth(phoneId); }
    }
  }
  await prisma.phone.updateMany({ where: { id: phoneId, isOnline: true }, data: { isOnline: false, status: "CLOSE", lastOfflineAt: new Date() } });
}

export async function suspendOwnedWaSessions(userId: string) {
  // Assignment is an access grant; disabling an assignee must not disconnect a different owner's device.
  const phones = await prisma.phone.findMany({ where: { userId, channel: "whatsapp" }, select: { id: true } });
  let failed = false;
  for (const phone of phones) {
    try {
      await waitForPendingSocket(userId, phone.id);
      if (await ownerCanSend(userId)) return; // A later activation wins over a delayed suspension.
      await suspendWaPhone(phone.id);
    } catch { failed = true; console.error("WA_PHONE_SUSPEND_FAILED", phone.id); }
  }
  if (failed) throw new Error("WA_ACCOUNT_SUSPEND_INCOMPLETE");
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

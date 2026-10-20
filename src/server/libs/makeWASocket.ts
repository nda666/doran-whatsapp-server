import "pino-pretty";
import { captureStop, reserveSend, recipientBlocked, SendGuardError } from "../messaging/safety";

import pino from "pino";

import _makeWASocket, {
  useMultiFileAuthState,
  WASocket,
} from "@whiskeysockets/baileys";

import { prisma } from "../../lib/prisma";
import { getWaMesage } from "../../server/utils/getWaMessage";
import { getPhoneById } from "../../services/phone";
import { WaSockQrTimeout } from "../constant";
import connectionUpdate from "../events/connectionUpdate";
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
  if (!phone || phone.userId !== userId || phone.active !== 1) {
    throw new Error(`Device ${phoneId} is not active`);
  }
  const existing = session.get(phoneId);
  if (existing && !replaceState && !existing.ws.isClosed && !existing.ws.isClosing) return existing;
  if (existing) {
    retiredSockets.add(existing);
    session.delete(phoneId);
    existing.end(new Error("WA_SOCKET_REPLACED"));
    await waitForAuthSave(existing);
  }

  // eslint-disable-next-line react-hooks/rules-of-hooks
  const { state, saveCreds } = await useMultiFileAuthState(
    `${process.env.WHATSAPP_AUTH_FOLDER || "./storage/whatsapp-auth"}/${userId}-${phoneId}`
  );
  let _waSocket = {} as WASocket;

  if (session.get(phoneId) && !replaceState) {
    _waSocket = session.get(phoneId)!;
  } else {
    // const webVersion = await fetchLatestWaWebVersion({});
    _waSocket = await _makeWASocket({
      // logger: waSocketLogOption,
      logger: pino({ level: "silent" }),
      auth: state,
      shouldSyncHistoryMessage: (m) => false,
      syncFullHistory: false,
      markOnlineOnConnect: phone.showOnline,
      qrTimeout: WaSockQrTimeout,
    });
    waRecovery.blocked.delete(phoneId);
    waRecovery.sockets.set(_waSocket, { createdAt: Date.now(), connected: false });
    session.set(phoneId, _waSocket);
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
    _waSocket.sendMessage = async (jid, content, options) => {
      const generationOptions = { ...options, getUrlInfo: safeLinkPreview };
      const guardJid = jid.endsWith("@lid") ? await _waSocket.signalRepository.lidMapping.getPNForLID(jid) : jid;
      if (!guardJid) throw new SendGuardError("RECIPIENT_ID_UNRESOLVED");
      const day = await reserveSend(userId, phoneId, guardJid);
      if (guardJid.endsWith("@s.whatsapp.net") && await recipientBlocked(userId, guardJid.split("@")[0].split(":")[0])) throw new SendGuardError("RECIPIENT_OPTED_OUT");
      let result;
      try { result = await sendMessage(jid, content, generationOptions); }
      catch (error) {
        await prisma.deviceDailyUsage.update({ where: { phoneId_day: { phoneId, day } }, data: { failures: { increment: 1 } } }).catch(() => console.error("SEND_FAILURE_COUNT_FAILED"));
        throw error;
      }
      if (result) await captureChatMessage(phoneId, result, _waSocket).catch(() => console.error("CHAT_OUTGOING_SAVE_FAILED", phoneId));
      return result;
    };

    // console.info("CREATE new session: " + phoneId);
    _waSocket.ev.on("creds.update", (authState) => {
      const saving = (authWrites.get(_waSocket) || Promise.resolve()).catch(() => {}).then(saveCreds);
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
      recordQrState(_waSocket, update, WaSockQrTimeout);
      connectionUpdate(_waSocket, userId, phoneId, update).catch(error => {
        console.error("WhatsApp connection update failed:", error.message);
      });
    });

    // onCreated && onCreated(_waSocket);

    // for reply
    _waSocket.ev.on("messages.upsert", async ({ messages: batch, type }) => {
      if (phoneMaintenance.has(phoneId) || retiredSockets.has(_waSocket)) return;
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
  const results = await Promise.allSettled(Array.from(session.values()).map(async socket => {
    try { await waitForAuthSave(socket); }
    finally { socket.end(new Error("SERVER_SHUTDOWN")); }
  }));
  session.clear();
  if (results.some(result => result.status === "rejected")) throw new Error("WA_SHUTDOWN_FAILED");
}

export default makeWASocket;

import "pino-pretty";

import pino from "pino";

import _makeWASocket, {
  ConnectionState,
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
import { getSocketIO } from "./socket";

export const session = new Map();

const waSocketLogOption = pino({
  enabled: false,
  level: "error",
}) as any;

export const forceUpdateConnectionState = async (
  userId: string,
  phoneId: string
) => {
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const { state, saveCreds } = await useMultiFileAuthState(
    `${process.env.WHATSAPP_AUTH_FOLDER}/${userId}-${phoneId}`
  );

  const _waSocket = await _makeWASocket({
    logger: waSocketLogOption,
    printQRInTerminal: false,
    auth: state,
    syncFullHistory: false,
    qrTimeout: WaSockQrTimeout,
    defaultQueryTimeoutMs: undefined,
  });
  const updateOnlineStatus = async (update: Partial<ConnectionState>) => {
    const io = getSocketIO;
    // console.log(update);
    if (update.hasOwnProperty("isOnline")) {
      io?.to(userId).emit("isOnline", {
        isOnline: update.isOnline,
        phoneId: phoneId,
      });

      await prisma.phone.update({
        where: {
          id: phoneId,
        },
        data: {
          isOnline: update.isOnline,
        },
      });
    }
  };
  setTimeout(() => {
    _waSocket.ev.off("connection.update", updateOnlineStatus);
  }, 1000 * 60);
  _waSocket.ev.on("connection.update", updateOnlineStatus);
};

const makeWASocket = async (
  userId: string,
  phoneId: string,
  onCreated?: (waSock: WASocket) => void
): Promise<WASocket> => {
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const { state, saveCreds } = await useMultiFileAuthState(
    `${process.env.WHATSAPP_AUTH_FOLDER}/${userId}-${phoneId}`
  );
  let _waSocket = {} as WASocket;

  if (session.get(phoneId)) {
    _waSocket = session.get(phoneId);
  } else {
    _waSocket = await _makeWASocket({
      logger: waSocketLogOption,
      printQRInTerminal: false,
      auth: state,
      syncFullHistory: false,
      qrTimeout: WaSockQrTimeout,
      defaultQueryTimeoutMs: undefined,
    });

    // console.info("CREATE new session: " + phoneId);
    _waSocket.ev.on("creds.update", (authState) => {
      saveCreds();
    });

    // return _waSocket;
    _waSocket.ev.on("connection.update", async (update) => {
      connectionUpdate(_waSocket, userId, phoneId, update);
    });

    onCreated && onCreated(_waSocket);

    // for reply
    _waSocket.ev.on("messages.upsert", async ({ messages }) => {
      if (messages[0].key.fromMe) {
        return;
      }
      const { messageIn, messageType, quotedMessage } = getWaMesage(messages);

      const getPhone = await getPhoneById(phoneId);
      if (messageIn && !quotedMessage && getPhone) {
        await handleMessageInEvent({
          phone: getPhone,
          _waSocket: _waSocket,
          messageIn: messageIn,
          messages: messages,
          userId: userId,
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
        });
      }
    });
  }

  if (_waSocket.user) {
    await prisma.phone.update({
      where: {
        id: phoneId,
      },
      data: {
        number: _waSocket.user.id.split(":")[0],
        account_name: _waSocket.user.name,
      },
    });
  }

  session.set(phoneId, _waSocket);
  return _waSocket;
};

export const deleteSession = (phoneId: string) => {
  session.delete(phoneId);
};

export const getAllSession = () => {
  return session;
};

export default makeWASocket;

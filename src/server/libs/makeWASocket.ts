import "pino-pretty";
import "pino-roll";

import { pino } from "pino";

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

const session = new Map();

// {
// transport: {
//   targets: [
//     {
//       level: "debug",
//       target: "pino-pretty",
//       options: {
//         colorize: true,
//       },
//     },
//     {
//       level: "error",
//       target: "pino-roll",
//       options: {
//         file: "./whatsapp-logs/whatsapp.log",
//         frequency: "daily",
//         colorize: true,
//         mkdir: true,
//       },
//     },
//   ],
// },
// }

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
  const waSocketLogOption = pino({
    enabled: true,
    level: "error",
    transport: {
      targets: [
        // {
        //   level: "error",
        //   target: "pino-pretty",
        //   options: {
        //     colorize: false,
        //   },
        // },
        {
          level: "error",
          target: "pino-roll",
          options: {
            file: `${process.env.WHATSAPP_LOG}/whatsapp.log`,
            frequency: "daily",
            colorize: false,
            mkdir: true,
            dateFormat: "yyyy-MM-dd",
            symlink: true,
          },
        },
      ],
    },
  }) as any;
  if (session.get(phoneId)) {
    _waSocket = session.get(phoneId);
    // console.info("GET from session: " + _waSocket.user);
  } else {
    _waSocket = await _makeWASocket({
      printQRInTerminal: false,
      auth: state,
      logger: waSocketLogOption,
      syncFullHistory: true,
      qrTimeout: WaSockQrTimeout + 5,
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
      // if (messages[0].key.fromMe) {
      //   return;
      // }
      const { messageIn, messageType, quotedMessage } = getWaMesage(messages);

      const getPhone = await getPhoneById(phoneId);
      if (messageIn && !quotedMessage && getPhone) {
        await handleMessageInEvent(getPhone, _waSocket, messageIn, messages);
      }

      if (quotedMessage && getPhone) {
        await handleQuotedMessageEvent({
          messages: messages,
          messageType: messageType,
          phone: getPhone,
          quotedMessage: quotedMessage,
          waSocket: _waSocket,
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

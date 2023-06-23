import _makeWASocket, { useMultiFileAuthState } from "@whiskeysockets/baileys";
import { pino } from "pino";
import { prisma } from "./prisma";

export const waSocketLogOption = pino({
  transport: {
    targets: [
      // {
      //   level: "debug",
      //   target: "pino-pretty",
      //   options: {
      //     colorize: true,
      //   },
      // },
      {
        level: "error",
        target: "pino-roll",
        options: {
          file: "./whatsapp-logs/whatsapp.log",
          frequency: "daily",
          colorize: true,
          mkdir: true,
        },
        // target: "pino-pretty",
        // options: {
        //   colorize: false,
        //   destination: "./whatsapp-logs/whatsapp.log",
        // },
      },
    ],

    // target: "pino/file",
    // options: {
    //   destination:
    //     "/run/media/tiar/Website/www/doran-whatsapp-server/pino.log",
    // },
  },
});

const makeWASocket = async (userId: string, phoneId: string) => {
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const { state, saveCreds } = await useMultiFileAuthState(
    `./whatsapp-auth/${userId}-${phoneId}`
  );

  const _waSocket = await _makeWASocket({
    printQRInTerminal: false,
    auth: state,
    syncFullHistory: false,
    logger: waSocketLogOption,
  });

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

  _waSocket.ev.on("creds.update", (authState) => {
    saveCreds();
  });
  return _waSocket;
};

export default makeWASocket;

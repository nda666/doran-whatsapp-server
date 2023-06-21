import { WaSockQrTimeout } from "@/server/constant";
import _makeWASocket, { useMultiFileAuthState } from "@whiskeysockets/baileys";
import { pino } from "pino";

export const waSocketLogOption = pino({
  transport: {
    targets: [
      {
        level: "debug",
        target: "pino-pretty",
        options: {
          colorize: true,
        },
      },
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

  return await _makeWASocket({
    printQRInTerminal: false,
    auth: state,
    syncFullHistory: false,
    logger: waSocketLogOption,
  });
};

export default makeWASocket;

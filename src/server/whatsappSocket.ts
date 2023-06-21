import makeWASocket, { useMultiFileAuthState } from "@whiskeysockets/baileys";
import { Socket } from "socket.io";
import { waSocketLogOption } from "../lib/makeWASocket";
import { WaSockQrTimeout } from "./constant";
import connectionUpdate from "./events/connectionUpdate";

export default async function whatsappSocket(
  io: Socket,
  userId: string,
  phoneId: string
) {
  const authFolder = `./whatsapp-auth/${userId}-${phoneId}`;

  // if (readdirSync(`${authFolder}`).length === 0) {
  //   return false;
  // }
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const { state, saveCreds } = await useMultiFileAuthState(authFolder);
  try {
    const waSock = await makeWASocket({
      printQRInTerminal: false,
      auth: state,
      qrTimeout: WaSockQrTimeout,
      syncFullHistory: false,
      logger: waSocketLogOption,
    });
    waSock.ev.on("creds.update", (authState) => {
      saveCreds();
      io?.emit("credsUpdate", authState);
    });

    waSock.ev.on("connection.update", (update) => {
      connectionUpdate(io, waSock, userId, phoneId, update);
    });
    return waSock;
  } catch (e) {
    return false;
  }
}

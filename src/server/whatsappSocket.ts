import makeWASocket, {
  useMultiFileAuthState,
  BaileysEventMap,
} from "@whiskeysockets/baileys";
import { existsSync, readdirSync } from "fs";
import { Server } from "socket.io";
import connectionUpdate from "./events/connectionUpdate";
import { WaSockQrTimeout } from "./constant";
import { DefaultEventsMap } from "socket.io/dist/typed-events";
import { Socket } from "socket.io";

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

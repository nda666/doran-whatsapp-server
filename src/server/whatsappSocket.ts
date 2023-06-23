import { useMultiFileAuthState } from "@whiskeysockets/baileys";
import { Socket } from "socket.io";
import makeWASocket, { waSocketLogOption } from "../lib/makeWASocket";
import { WaSockQrTimeout } from "./constant";
import connectionUpdate from "./events/connectionUpdate";

export default async function whatsappSocket(
  io: Socket,
  userId: string,
  phoneId: string
) {
  // if (readdirSync(`${authFolder}`).length === 0) {
  //   return false;
  // }
  // eslint-disable-next-line react-hooks/rules-of-hooks
  try {
    const waSock = await makeWASocket(userId, phoneId);

    waSock.ev.on("connection.update", (update) => {
      connectionUpdate(io, waSock, userId, phoneId, update);
    });

    return waSock;
  } catch (e) {
    console.log("ERROR ", e);
    return false;
  }
}

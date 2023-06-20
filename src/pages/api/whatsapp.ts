import makeWASocket, {
  ConnectionState,
  DisconnectReason,
  useMultiFileAuthState,
} from "@whiskeysockets/baileys";
import { Boom } from "@hapi/boom";
import { NextApiRequest, NextApiResponse } from "next";
import { Server } from "socket.io";

export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const { state, saveCreds } = await useMultiFileAuthState("auth_info_baileys");
  const waSock = makeWASocket({
    // can provide additional config here
    printQRInTerminal: false,
    auth: state,
  });
  waSock.ev.on("creds.update", (x: any) => console.log(x));
  waSock.ev.on("connection.update", (update: ConnectionState) => {
    if (update.qr) {
      (res.socket as any)?.server?.io?.emit("qr", update.qr);
      console.log("res socket", res.socket as any);
    }
    const { connection, lastDisconnect } = update;
    if (connection === "close") {
      const shouldReconnect =
        (lastDisconnect.error as Boom)?.output?.statusCode !==
        DisconnectReason.loggedOut;
      console.log(
        "connection closed due to ",
        lastDisconnect.error,
        ", reconnecting ",
        shouldReconnect
      );
      // reconnect if not logged out
      if (shouldReconnect) {
        // connectToWhatsApp()
      }
    } else if (connection === "open") {
      console.log("opened connection");
    }
  });
  res.status(200).json({ message: "run" });

  res.status(200).json({ message: "already run" });
}

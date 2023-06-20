import { prisma } from "@/lib/prisma";
import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  WASocket,
} from "@whiskeysockets/baileys";
import { NextApiRequest, NextApiResponse } from "next";
import { getToken } from "next-auth/jwt";
import { Server } from "socket.io";
import fs from "fs";

async function createWaSock(io: Server, userId: string, phoneNumber: string) {
  const authFolder = `./whatsapp-auth/${userId}-${phoneNumber}`;
  const qrTimeout = parseInt(process.env.WHATSAPP_QRTIMEOUT || "30") * 1000;
  if (fs.existsSync(`${authFolder}/creds.json`)) {
    return false;
  }

  // eslint-disable-next-line react-hooks/rules-of-hooks
  const { state, saveCreds } = await useMultiFileAuthState(
    `./whatsapp-auth/${userId}-${phoneNumber}`
  );

  const waSock = await makeWASocket({
    printQRInTerminal: false,
    auth: state,
    qrTimeout,
  });

  waSock.ev.on("creds.update", (authState) => {
    saveCreds();
    io?.to(`${userId}-${phoneNumber}`).emit("authState", authState);
  });

  waSock.ev.on("connection.update", (update) => {
    io?.to(`${userId}-${phoneNumber}`).emit("connectionState", update);
    if (update.qr) {
      io?.to(`${userId}-${phoneNumber}`).emit(`qr`, {
        qr: update.qr,
        timeout: qrTimeout,
      });
    }
    const { connection, lastDisconnect } = update;
    if (connection === "close") {
      const shouldReconnect =
        (lastDisconnect?.error as any)?.output?.statusCode !==
        DisconnectReason.loggedOut;
      console.log(
        "connection closed due to ",
        lastDisconnect?.error,
        ", reconnecting ",
        shouldReconnect
      );
      // reconnect if not logged out
      if (shouldReconnect) {
        waSock.ws.close();
        createWaSock(io, userId, phoneNumber);
      }
    } else if (connection === "open") {
    }

    prisma.phone.updateMany({
      where: {
        userId,
        number: phoneNumber,
      },
      data: {
        status: connection?.toUpperCase() as any,
        isOnline: update.isOnline,
      },
    });
  });
  return waSock;
}
export default async function startSocketIo(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const token = await getToken({ req });
  let io: Server | undefined = undefined;
  if (!(res.socket as any).server.io) {
    console.log("*First use, starting socket.io");

    io = new Server((res.socket as any).server, {
      path: "/api/socketio",
    });

    io?.engine.on("connection_error", (err: unknown) => {
      console.error(`Connection error: ${err}`);
    });
  }

  io?.on("connection", async (socket) => {
    const phoneNumber = socket.handshake.query?.phone?.toString();
    const userId = socket.handshake.query?.userId?.toString();
    console.log(`Join to room: ${userId}-${phoneNumber}`);

    socket.join(`${userId}-${phoneNumber}`);
    if (io) {
      const waSock = await createWaSock(io, userId!, phoneNumber!);
      if (waSock) {
        io?.to(`${token?.id!}-${req.query?.phone}`).emit(
          "authState",
          waSock.user
        );
      }
    }
  });

  (res.socket as any).server.io = io;

  res.end();
}

export const config = {
  api: {
    bodyParser: false,
  },
};

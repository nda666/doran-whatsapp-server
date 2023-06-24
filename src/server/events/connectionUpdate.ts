import {
  ConnectionState,
  DisconnectReason,
  WASocket,
} from "@whiskeysockets/baileys";
import * as fs from "fs";
import makeWASocket, { deleteSession } from "../../lib/makeWASocket";
import { WaSockQrTimeout } from "../constant";
import { prisma } from "../../lib/prisma";
import { getSocketIO } from "../../lib/socket";

export default async function connectionUpdate(
  waSock: WASocket,
  userId: string,
  phoneId: string,
  update: Partial<ConnectionState>
) {
  const io = getSocketIO;
  if (waSock.user) {
    io?.to(userId).emit("waUser", { phoneId, waUser: waSock.user });
  }
  io?.to(userId).emit("isOnline", {
    isOnline: update.isOnline,
    phoneId: phoneId,
  });

  if (update.qr) {
    io?.to(userId).emit(`qr`, {
      phoneId,
      qr: update.qr,
      timeout: WaSockQrTimeout,
    });
    await prisma.phone.update({
      where: {
        id: phoneId,
      },
      data: {
        qrCode: update.qr,
      },
    });
  } else {
    io?.to(userId).emit("connectionState", { ...update, phoneId: phoneId });
  }
  const { connection, lastDisconnect } = update;
  if (update.isNewLogin) {
    // waSock.ev.flush(true);
    // whatsappSocket(io, userId, phoneId);
  }

  if (update.isOnline) {
    io?.to(userId).emit("isOnline", {
      isOnline: update.isOnline,
      phoneId: phoneId,
    });

    await prisma.phone.update({
      where: {
        id: phoneId,
      },
      data: {
        isOnline: true,
      },
    });

    // waSock.ev.flush(true);
  }

  if (connection === "close") {
    await prisma.phone.update({
      where: {
        id: phoneId,
      },
      data: {
        isOnline: false,
      },
    });
    io?.to(userId).emit("connectionState", {
      update: "lalalala",
      t: (lastDisconnect?.error as any)?.output?.statusCode,
    });
    const shouldReconnectStatus = [
      DisconnectReason.restartRequired,
      DisconnectReason.loggedOut,
    ];
    const shouldReconnect = shouldReconnectStatus.includes(
      (lastDisconnect?.error as any)?.output?.statusCode
    );
    // console.log(
    //   "connection closed due to ",
    //   lastDisconnect?.error,
    //   ", reconnecting ",
    //   shouldReconnect
    // );
    // reconnect if not logged out
    if (shouldReconnect) {
      fs.rmSync(`./whatsapp-auth/${userId}-${phoneId}`, {
        recursive: true,
        force: true,
      });
    }

    deleteSession(phoneId);
    makeWASocket(userId, phoneId);
  } else if (connection === "open") {
  }
}

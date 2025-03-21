import * as fs from "fs";

import {
  ConnectionState,
  DisconnectReason,
  WASocket,
} from "@whiskeysockets/baileys";

import { prisma } from "../../lib/prisma";
import { WaSockQrTimeout } from "../constant";
import makeWASocket, { deleteSession } from "../libs/makeWASocket";
import { getSocketIO } from "../libs/socket";

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
    // await prisma.phone.update({
    //   where: {
    //     id: phoneId,
    //   },
    //   data: {
    //     qrCode: update.qr,
    //   },
    // });
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
      DisconnectReason.loggedOut,
      DisconnectReason.restartRequired,
      DisconnectReason.timedOut,
    ];

    const shouldReconnect = shouldReconnectStatus.includes(
      (lastDisconnect?.error as any)?.output?.statusCode
    );

    // reconnect if not logged out
    if (
      (lastDisconnect?.error as any)?.output?.statusCode ==
      DisconnectReason.loggedOut
    ) {
      fs.rmSync(`./storage/whatsapp-auth/${userId}-${phoneId}`, {
        recursive: true,
        force: true,
      });
    }
    if (shouldReconnect) {
      deleteSession(phoneId);
    }
    makeWASocket(userId, phoneId);
  }
}

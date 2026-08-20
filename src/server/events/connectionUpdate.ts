import * as fs from "fs";

import {
  ConnectionState,
  DisconnectReason,
  WASocket,
} from "@whiskeysockets/baileys";
import { PhoneStatus } from "@prisma/client";

import { prisma } from "../../lib/prisma";
import { broadcastPhoneStatusUpdate } from "../../services/webhookService";
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

    broadcastPhoneStatusUpdate({
      phoneId,
      qr: update.qr,
      connection: update.connection,
    });
  }

  const { connection, lastDisconnect } = update;
  if (update.isNewLogin) {
    // waSock.ev.flush(true);
    // whatsappSocket(io, userId, phoneId);
  }

  if (connection === "open" || update.isOnline) {
    io?.to(userId).emit("isOnline", {
      isOnline: true,
      phoneId: phoneId,
    });

    await prisma.phone.update({
      where: {
        id: phoneId,
      },
      data: {
        isOnline: true,
        status: PhoneStatus.OPEN,
      },
    });

    broadcastPhoneStatusUpdate({
      phoneId,
      isOnline: true,
      status: PhoneStatus.OPEN,
      connection: connection || "open",
    });
  }

  if (connection === "connecting") {
    await prisma.phone.update({
      where: {
        id: phoneId,
      },
      data: {
        status: PhoneStatus.CONNECTING,
      },
    });

    broadcastPhoneStatusUpdate({
      phoneId,
      status: PhoneStatus.CONNECTING,
      connection: "connecting",
    });
  }

  if (connection === "close") {
    await prisma.phone.update({
      where: {
        id: phoneId,
      },
      data: {
        isOnline: false,
        status: PhoneStatus.CLOSE,
      },
    });
    io?.to(userId).emit("connectionState", {
      update: "lalalala",
      t: (lastDisconnect?.error as any)?.output?.statusCode,
    });

    broadcastPhoneStatusUpdate({
      phoneId,
      isOnline: false,
      status: PhoneStatus.CLOSE,
      connection: "close",
      lastDisconnect,
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


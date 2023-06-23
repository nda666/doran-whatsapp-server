import {
  ConnectionState,
  DisconnectReason,
  WASocket,
} from "@whiskeysockets/baileys";
import * as fs from "fs";
import { Socket } from "socket.io";
import whatsappSocket from "../whatsappSocket";
import { updatePhoneStatusAndOnline } from "../../lib/phone";
import { WaSockQrTimeout } from "../constant";
import { prisma } from "../../lib/prisma";

export default function connectionUpdate(
  io: Socket,
  waSock: WASocket,
  userId: string,
  phoneId: string,
  update: Partial<ConnectionState>
) {
  if (waSock.user) {
    io?.emit("waUser", { phoneId, waUser: waSock.user });
  }

  if (update.connection == "close") {
    // io?.to(`${userId}`).emit(`connectionState`, "FUCJJJ");
    // fs.rmSync(`./whatsapp-auth/${userId}-${phoneId}`, {
    //   recursive: true,
    //   force: true,
    // });
    // whatsappSocket(io, userId, phoneId);
  }

  if (update.qr) {
    io?.emit(`qr`, {
      phoneId,
      qr: update.qr,
      timeout: WaSockQrTimeout,
    });
  } else {
    io?.emit("connectionState", { ...update, phoneId: phoneId });
  }
  const { connection, lastDisconnect } = update;
  if (update.isNewLogin) {
    io?.emit("isOnline", {
      isOnline: update.isNewLogin,
      phoneId: phoneId,
    });
    waSock.ev.flush(true);
    whatsappSocket(io, userId, phoneId);
  }
  if (update.isOnline) {
    io?.emit("isOnline", update.isOnline);
  }

  if (connection === "close") {
    io?.emit("connectionState", {
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
      waSock.ev.flush(true);
      fs.rmSync(`./whatsapp-auth/${userId}-${phoneId}`, {
        recursive: true,
        force: true,
      });
      whatsappSocket(io, userId, phoneId);
    }
  } else if (connection === "open") {
  }
}

import express from "express";
import compression from "compression";
import http from "http";
import { prisma } from "./lib/prisma";
import next from "next";
import { WASocket, delay } from "@whiskeysockets/baileys";
import * as socketio from "socket.io";

import makeWASocket, { deleteSession } from "./lib/makeWASocket";
import { CountryCode, parsePhoneNumber } from "libphonenumber-js";
import sendMessageFromIo from "./lib/sendMessageFromIo";

const hostname = "localhost";
const port = parseInt(process.env.PORT || "3000", 10);
const dev = process.env.NODE_ENV !== "production";

const app = express();
app.use(compression());

const nextApp = next({ dev, hostname, port });
const nextHandler = nextApp.getRequestHandler();

process.on("SIGINT", async function () {
  await prisma.$disconnect();
});

nextApp.prepare().then(async () => {
  // const server = http.createServer(app);

  app.all("*", (req, res, next) => {
    res.setTimeout(20000, function () {
      res.status(408).end();
    });
    nextHandler(req, res);
  });
  // const httpServer = http.createServer(server);
  const server = app.listen(port, () => {
    console.info(`> Ready on http://localhost:${port}`);
    process.send && process.send("ready");
  });
  const io = new socketio.Server({
    cors: {
      origin: "*",
      methods: ["GET", "POST"], // Add allowed methods if needed
    },
  });
  io?.on("connection", async (socket) => {
    socket.on(
      "sendTextMessage",
      async ({
        phoneId,
        userId,
        tos,
        phoneCountry,
        message,
      }: {
        phoneId: string;
        userId: string;
        tos: string[];
        phoneCountry: string;
        message: string;
      }) => {
        await sendMessageFromIo({
          userId,
          phoneId,
          message,
          phoneCountry,
          tos,
        });
      }
    );

    if (socket.handshake.query?.phoneId && socket.handshake.query?.userId) {
      const query = socket.handshake.query;
      const userId = socket.handshake.query?.userId?.toString();
      const phoneIds = query?.phoneId?.toString().split(",");
      const uniqPhoneIds = phoneIds!.filter(function (v, i, self) {
        return i == self.indexOf(v);
      });

      const waSocks: WASocket[] = [];

      uniqPhoneIds?.forEach(async (phoneId) => {
        const createdWaSock = await makeWASocket(userId, phoneId);
        createdWaSock && waSocks.push(createdWaSock);
      });

      socket.join(`${userId}`);
    }

    // socket?.on("disconnect", async (reason) => {
    //   console.log("event flushed 1");
    //   waSocks.forEach((waSock) => {
    //     waSock.ev.flush(true);
    //   });
    // });
  });
  io.attach(server);
});

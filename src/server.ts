import express from "express";
import compression from "compression";
import http from "http";
import { prisma } from "./lib/prisma";
import next from "next";
import { WASocket } from "@whiskeysockets/baileys";
import { getSocketIO } from "./lib/socket";
import makeWASocket from "./lib/makeWASocket";
import sendMessageFromIo from "./lib/sendMessageFromIo";
import sendGroupMessageFromIo from "./lib/sendGroupMessageFromIo";

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

const waSocks: WASocket[] = [];
const io = getSocketIO;

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

  io?.on("connection", async (socket) => {
    // socket.onAny(async (event) => {
    //   console.log("EVENT ", event);
    // });

    socket.on(
      "sendTextMessage",
      async ({
        phoneId,
        userId,
        tos,
        phoneCountry,
        message,
        image,
      }: {
        phoneId: string;
        userId: string;
        tos: string[];
        phoneCountry: string;
        message: string;
        image: any;
      }) => {
        await sendMessageFromIo({
          userId,
          phoneId,
          message,
          phoneCountry,
          tos,
          image,
        });
      }
    );

    socket.on(
      "sendGroupMessage",
      async ({
        phoneId,
        userId,
        // tos,
        phoneCountry,
        message,
        image,
        id_group,
      }: {
        phoneId: string;
        userId: string;
        // tos: string[];
        phoneCountry: string;
        message: string;
        image: any;
        id_group: string;
      }) => {
        await sendGroupMessageFromIo({
          userId,
          phoneId,
          // tos,
          phoneCountry,
          message,
          image,
          id_group,
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

      uniqPhoneIds?.forEach(async (phoneId) => {
        const createdWaSock = await makeWASocket(userId, phoneId);

        createdWaSock && waSocks.push(createdWaSock);
      });

      socket.join(`${userId}`);
    }

    // socket.on("disconnecting", () => {
    //   // console.log("event flushed 2");
    //   waSocks.forEach((waSock) => {
    //     // waSock.ev.flush(true);
    //   });
    // });

    // socket?.on("disconnect", async (reason) => {
    //   console.log("event flushed 1");
    //   waSocks.forEach((waSock) => {
    //     waSock.ev.flush(true);
    //   });
    // });
  });
  io.attach(server);
});

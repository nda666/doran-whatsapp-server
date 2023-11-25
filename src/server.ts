import express from "express";
import compression from "compression";
import { prisma } from "./lib/prisma";
import next from "next";
import { WASocket } from "@whiskeysockets/baileys";
import { getSocketIO } from "./lib/socket";
import makeWASocket from "./lib/makeWASocket";
import sendMessageFromIo from "./lib/sendMessageFromIo";
import sendGroupMessageFromIo from "./lib/sendGroupMessageFromIo";
import { Server, createServer } from "http";

const hostname = "localhost";
const port = parseInt(process.env.PORT || "3000", 10);
const dev = process.env.NODE_ENV !== "production";

const app = express();
app.use(compression());

const nextApp = next({ dev, customServer: true });
const nextHandler = nextApp.getRequestHandler();

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
  // const server = app.listen(port, "0.0.0.0", () => {
  //   console.info(`> Ready on http://localhost:${port}`);
  //   process.send && process.send("ready");
  // });

  // const server = app.listen(port, () => {
  //   console.info(`> Ready on http://localhost:${port}`);
  //   process.send && process.send("ready");
  // });

  io?.on("connection", async (socket) => {
    // Sementara pakai onAny sampai Bug nya ketemu
    socket.onAny((event, params) => {
      if (event === "sendTextMessage") {
        sendMessageFromIo(params);
      } else if (event === "sendGroupMessage") {
        sendGroupMessageFromIo(params);
      }
    });
    socket.on("connect_error", (err) => {
      console.log(`connect_error due to ${err.message}`);
    });
    // socket.on(
    //   "sendTextMessage",
    //   async ({
    //     phoneId,
    //     userId,
    //     tos,
    //     phoneCountry,
    //     message,
    //     image,
    //   }: {
    //     phoneId: string;
    //     userId: string;
    //     tos: string[];
    //     phoneCountry: string;
    //     message: string;
    //     image: any;
    //   }) => {
    //     console.log("EVENT");
    //     await sendMessageFromIo({
    //       userId,
    //       phoneId,
    //       message,
    //       phoneCountry,
    //       tos,
    //       image,
    //     });
    //   }
    // );

    // socket.on(
    //   "sendGroupMessage",
    //   async ({
    //     phoneId,
    //     userId,
    //     // tos,
    //     phoneCountry,
    //     message,
    //     image,
    //     id_group,
    //   }: {
    //     phoneId: string;
    //     userId: string;
    //     // tos: string[];
    //     phoneCountry: string;
    //     message: string;
    //     image: any;
    //     id_group: string;
    //   }) => {
    //     await sendGroupMessageFromIo({
    //       userId,
    //       phoneId,
    //       // tos,
    //       phoneCountry,
    //       message,
    //       image,
    //       id_group,
    //     });
    //   }
    // );

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
    //   //
    //   waSocks.forEach((waSock) => {
    //     // waSock.ev.flush(true);
    //   });
    // });

    // socket?.on("disconnect", async (reason) => {
    //
    //   waSocks.forEach((waSock) => {
    //     waSock.ev.flush(true);
    //   });
    // });
  });

  // const httpServer = http.createServer(server);

  const server: Server = createServer(app);
  io.attach(server);
  const isDevelopment = process.env.NODE_ENV == 'development' ? true : false;
  const host = isDevelopment ? "localhost" : "0.0.0.0";
  server.listen(port, host, () => {
    if (process.env.NODE_ENV !== "production")
      console.info(
        `> Ready on http://localhost:${port} or http://0.0.0.0:${port}`
      );
  });
});

process.on("SIGINT", async function () {
  await prisma.$disconnect();
  process.exit();
});

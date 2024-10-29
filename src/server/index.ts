import compression from 'compression';
import express from 'express';
import {
  createServer,
  Server,
} from 'http';
import next from 'next';

import { WASocket } from '@whiskeysockets/baileys';

import { prisma } from '../lib/prisma';
import { logger } from './libs/logger';
import makeWASocket from './libs/makeWASocket';
import sendAttachmentMessageIo from './libs/sendAttachmentMessageIo';
import sendGroupMessageFromIo from './libs/sendGroupMessageFromIo';
import sendMessageFromIo from './libs/sendMessageFromIo';
import { getSocketIO } from './libs/socket';

const hostname = "localhost";
const port = parseInt(process.env.PORT || "3000", 10);
const dev = process.env.NODE_ENV !== "production";

const app = express();
app.use(compression());
// app.use(
//   pinoHttp({
//     logger: logger(`${process.env.WEBSITE_LOG}/website.log`),
//   })
// );

const nextApp = next({ dev, hostname, port, customServer: false });
const nextHandler = nextApp.getRequestHandler();

const waSocks: WASocket[] = [];
const io = getSocketIO;

nextApp.prepare().then(async () => {
  const appLogger = logger(`${process.env.WEBSITE_LOG}/website.log`);
  // const server = http.createServer(app);

  app.all("*", (req, res, next) => {
    res.setTimeout(20000, function () {
      res.status(408).end();
    });
    nextHandler(req, res).catch((err) => {
      appLogger.error(err);
      res.status(500).send("Internal Server Error");
    });
  });
  io?.on("connection", async (socket) => {
    socket.on(
      "sendTextMessage",
      async (
        {
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
        },
        callback
      ) => {
        const sendResp = await sendMessageFromIo({
          userId,
          phoneId,
          message,
          phoneCountry,
          tos,
          image,
        });
        // Kirim balik ke client
        callback(sendResp);
      }
    );

    socket.on(
      "sendGroupMessage",
      async (
        {
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
        },
        callback
      ) => {
        const sendResp = await sendGroupMessageFromIo({
          userId,
          phoneId,
          // tos,
          phoneCountry,
          message,
          image,
          id_group,
        });
        // Kirim balik ke client
        callback(sendResp);
      }
    );

    socket.on(
      "sendAttachment",
      async (
        {
          phoneId,
          userId,
          tos,
          phoneCountry,
          caption,
          image,
        }: {
          phoneId: string;
          userId: string;
          tos: string[];
          phoneCountry: string;
          caption: string;
          image: any;
        },
        callback
      ) => {
        const sendResp = await sendAttachmentMessageIo({
          userId,
          phoneId,
          tos,
          phoneCountry,
          caption,
          image,
        });
        // Kirim balik ke client
        callback(sendResp);
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
  });

  const server: Server = createServer(app);
  io.attach(server);
  const isDevelopment = process.env.NODE_ENV == "development" ? true : false;
  const host = isDevelopment ? "0.0.0.0" : "0.0.0.0";
  server.listen(port, host, async () => {
    if (process.env.NODE_ENV !== "production") {
      console.info(
        `> Ready on http://localhost:${port} or http://0.0.0.0:${port}`
      );
    }
    connectAllWa();
  });
});

const connectAllWa = async () => {
  const phones = await prisma.phone.findMany();
  phones?.forEach(async (phone) => {
    const createdWaSock = await makeWASocket(phone.userId, phone.id);
    createdWaSock && waSocks.push(createdWaSock);
  });
};

process.on("SIGINT", async function () {
  await nextApp.close();
  await io.close();
  await prisma.$disconnect();
  process.exit();
});

// process.on("SIGKILL", async function () {
//   await nextApp.close();
//   await io.close();
//   await prisma.$disconnect();
//   process.exit();
// });

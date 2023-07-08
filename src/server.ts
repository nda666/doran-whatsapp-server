import express from "express";
import compression from "compression";
import { prisma } from "./lib/prisma";
import next from "next";
import { WASocket } from "@whiskeysockets/baileys";
import { getSocketIO } from "./lib/socket";
import makeWASocket from "./lib/makeWASocket";

const hostname = "localhost";
const port = parseInt(process.env.PORT || "3000", 10);
const dev = process.env.NODE_ENV !== "production";

const app = express();
app.use(compression());

const io = getSocketIO;
const nextApp = next({ dev, hostname, port });
const nextHandler = nextApp.getRequestHandler();

process.on("SIGINT", async function () {
  await prisma.$disconnect();
});

nextApp.prepare().then(async () => {
  // const server = http.createServer(app);

  app.get("/hello", async (_, res) => {
    res.send(JSON.stringify(await prisma.phone.findMany()));
  });

  io?.on("connection", async (socket) => {
    if (!socket.handshake.query?.phoneId) {
      throw new Error("phone id is required");
    }
    if (!socket.handshake.query?.userId) {
      throw new Error("user id is required");
    }
    const query = socket.handshake.query;
    const userId = socket.handshake.query?.userId?.toString();
    const phoneIds = query?.phoneId?.toString().split(",");

    const waSocks: WASocket[] = [];

    phoneIds?.forEach(async (phoneId) => {
      const createdWaSock = await makeWASocket(userId, phoneId);
      createdWaSock && waSocks.push(createdWaSock);
    });

    socket.join(`${userId}`);

    socket.on("disconnecting", () => {
      // console.log("event flushed 2");
      waSocks.forEach((waSock) => {
        // waSock.ev.flush(true);
      });
    });

    // socket?.on("disconnect", async (reason) => {
    //   console.log("event flushed 1");
    //   waSocks.forEach((waSock) => {
    //     waSock.ev.flush(true);
    //   });
    // });
  });

  app.all("*", (req, res, next) => {
    res.setTimeout(20000, function () {
      res.status(408).end();
    });
    nextHandler(req, res);
  });

  const server = app.listen(port, () => {
    console.info(`> Ready on http://localhost:${port}`);
    process.send && process.send("ready");
  });
  io.attach(server);
});

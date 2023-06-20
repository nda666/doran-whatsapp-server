import express from "express";
import * as http from "http";
import { prisma } from "./lib/prisma";
import next from "next";
import * as socketio from "socket.io";
import whatsappSocket from "./server/whatsappSocket";
import { WASocket } from "@whiskeysockets/baileys";

const hostname = "localhost";
const port = parseInt(process.env.PORT || "3000", 10);
const dev = process.env.NODE_ENV !== "production";
const nextApp = next({ dev, hostname, port });
const nextHandler = nextApp.getRequestHandler();

nextApp.prepare().then(async () => {
  const app = express();
  const server = http.createServer(app);
  const io = new socketio.Server();
  io.attach(server);

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

    socket.join(`${userId}`);

    const waSocks: WASocket[] = [];

    phoneIds?.forEach(async (phoneId) => {
      const createdWaSock = await whatsappSocket(socket, userId, phoneId);
      createdWaSock && waSocks.push(createdWaSock);
    });
    socket.on("disconnecting", () => {
      waSocks.forEach((waSock) => {
        waSock.ev.flush(true);
      });
    });

    socket?.on("disconnect", async (reason) => {
      waSocks.forEach((waSock) => {
        waSock.ev.flush(true);
      });
    });
  });

  app.all("*", (req, res) => nextHandler(req, res));

  server.listen(port, () => {
    console.log(`> Ready on http://localhost:${port}`);
  });
});

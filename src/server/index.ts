import chalk from "chalk";
import compression from "compression";
import express from "express";
import { createServer, Server } from "http";
import next from "next";

import sendWaQueue from "@/lib/queues/sendWaQueue";
import { createBullBoard } from "@bull-board/api";
import { BullAdapter } from "@bull-board/api/bullAdapter";
import { ExpressAdapter } from "@bull-board/express";
import { fetchLatestWaWebVersion } from "@whiskeysockets/baileys";

import { prisma } from "../lib/prisma";
import { logger } from "./libs/logger";
import makeWASocket from "./libs/makeWASocket";
import { getSocketIO } from "./libs/socket";

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

const nextApp = next({ dev, hostname, port, customServer: true });
const nextHandler = nextApp.getRequestHandler();

// const waSocks: WASocket[] = [];
const io = getSocketIO;

const bullExpress = new ExpressAdapter();

createBullBoard({
  queues: [new BullAdapter(sendWaQueue)],
  serverAdapter: bullExpress,
});

bullExpress.setBasePath("/queues");
app.use("/queues", bullExpress.getRouter());

nextApp.prepare().then(async () => {
  const webVersion = await fetchLatestWaWebVersion({});
  console.log("webVersion", webVersion);
  const appLogger = logger(`${process.env.WEBSITE_LOG}/website.log`);
  // const server = http.createServer(app);

  app.all("*", (req, res, next) => {
    res.setTimeout(120000, () => {
      res.status(408).end();
    });

    nextHandler(req, res).catch((err) => {
      appLogger.error(err);
      res.status(500).send("Internal Server Error");
    });
  });
  io?.on("connection", async (socket) => {});

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

  let intervalConnectRun = false;
  setInterval(() => {
    if (intervalConnectRun) {
      return;
    }

    intervalConnectRun = true;
    connectAllWa(true)
      .then(() => {
        intervalConnectRun = false;
      })
      .catch(() => {
        intervalConnectRun = false;
      });
  }, 30 * 60 * 1000); // 30 minutes interval
});

const connectAllWa = async (replaceSession = false) => {
  const phones = await prisma.phone.findMany();
  phones?.forEach(async (phone) => {
    if (phone.userId && phone.id) {
      const createdWaSock = await makeWASocket(
        phone.userId,
        phone.id,
        replaceSession
      );
      if (process.env.NODE_ENV == "development") {
        console.log(`${chalk.green(phone.number)}: ${createdWaSock.user?.id}`);
      }
    }
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

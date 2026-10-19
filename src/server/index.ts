import { startMessagingAlerts } from "./messaging/alerts";
import compression from "compression";
import express from "express";
import { createServer, Server } from "http";
import next from "next";

import { createBullBoard } from "@bull-board/api";
import { BullAdapter } from "@bull-board/api/bullAdapter";
import { ExpressAdapter } from "@bull-board/express";

import { prisma } from "../lib/prisma";
import sendWaQueue from "../lib/queues/sendWaQueue";
import { logger } from "./libs/logger";
import { closeWaSessions } from "./libs/makeWASocket";
import { recoverWaConnections, WA_RECOVERY_INTERVAL_MS } from "./waRecovery";
import { stopReconnectTimers } from "./events/connectionUpdate";
import { createGracefulShutdown } from "./gracefulShutdown";
import { getSocketIO } from "./libs/socket";
import { startDispatchWorker, getDispatchHealth } from "./dispatch/worker";
import { startDeviceWebhookWorker } from "./deviceWebhook/worker";
import { startDispatchWebhookWorker } from "./dispatchWebhook/worker";
import { queueAccess } from "./queueAccess";
let stopMessagingAlerts: (() => Promise<void>) | undefined;
let stopDispatchWebhookWorker: (() => Promise<void>) | undefined;
let stopDeviceWebhookWorker: (() => Promise<void>) | undefined;
let stopDispatchWorker: (() => Promise<void>) | undefined;
let httpServer: Server | undefined;
let reconnectInterval: NodeJS.Timeout | undefined;

const hostname = process.env.HOST || "127.0.0.1";
const port = parseInt(process.env.PORT || "3000", 10);
const dev = process.env.NODE_ENV !== "production";

const app = express();
app.use((_req, res, next) => {
  if (process.env.DORAN_SHUTTING_DOWN === "true") {
    res.setHeader("Retry-After", "5");
    return res.status(503).json({ message: "Server sedang memulai ulang. Silakan coba lagi." });
  }
  next();
});
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

if (sendWaQueue) createBullBoard({
  queues: [new BullAdapter(sendWaQueue)],
  serverAdapter: bullExpress,
});

bullExpress.setBasePath("/queues");
if (sendWaQueue) app.use("/queues", queueAccess, bullExpress.getRouter());
app.get("/health/dispatch", queueAccess, (_req, res) => {
  const health = getDispatchHealth();
  res.setHeader("Cache-Control", "no-store");
  res.status(health.healthy ? 200 : 503).json(health);
});

nextApp.prepare().then(async () => {
  const appLogger = logger(`${process.env.WEBSITE_LOG}/website.log`);
  // const server = http.createServer(app);

  app.all("*", (req, res, next) => {
    res.setTimeout(120000, () => {
      res.status(408).end();
    });

    nextHandler(req, res).catch((err) => {
      appLogger.error(err);
      if (!res.headersSent) res.status(500).send("Internal Server Error");
    });
  });
  io?.on("connection", async (socket) => {});

  const server: Server = createServer(app);
  httpServer = server;
  io.attach(server);
  const host = hostname;
  server.listen(port, host, async () => {
    stopDeviceWebhookWorker = startDeviceWebhookWorker();
    stopMessagingAlerts = startMessagingAlerts();
    stopDispatchWebhookWorker = startDispatchWebhookWorker();
    if (process.env.DISPATCH_QUEUE_ENABLED === "true" && process.env.WHATSAPP_ENABLED !== "false") stopDispatchWorker = startDispatchWorker();
    if (process.env.NODE_ENV !== "production") {
      console.info(
        `> Ready on http://localhost:${port} or http://0.0.0.0:${port}`
      );
    }
    if (process.env.WHATSAPP_ENABLED !== "false") {
      recoverWaConnections().catch(error => console.error("WhatsApp startup failed:", error.message));
    } else {
      console.info("Dashboard ready; WhatsApp connections are disabled.");
    }
  });

  let intervalConnectRun = false;
  reconnectInterval = setInterval(() => {
    if (process.env.WHATSAPP_ENABLED === "false" || intervalConnectRun) {
      return;
    }

    intervalConnectRun = true;
    recoverWaConnections()
      .then(() => {
        intervalConnectRun = false;
      })
      .catch((error) => {
        console.error("WhatsApp periodic connection failed:", error.message);
        intervalConnectRun = false;
      });
  }, WA_RECOVERY_INTERVAL_MS);
}).catch(error => {
  console.error("Dashboard startup failed:", error.message);
  process.exit(1);
});

const shutdown = createGracefulShutdown({
  stopIntake: () => {
    process.env.DORAN_SHUTTING_DOWN = "true";
    if (reconnectInterval) clearInterval(reconnectInterval);
    stopReconnectTimers();
  },
  drain: [() => stopMessagingAlerts?.(), () => stopDispatchWebhookWorker?.(), () => stopDeviceWebhookWorker?.(), () => stopDispatchWorker?.()],
  close: [
    closeWaSessions,
    async () => { if (io.engine) await io.close(); else io.disconnectSockets(true); },
    () => new Promise<void>((resolve, reject) => {
      if (!httpServer?.listening) return resolve();
      httpServer.close(error => error ? reject(error) : resolve());
      httpServer.closeIdleConnections();
    }),
    () => nextApp.close(),
    () => prisma.$disconnect(),
  ],
});
process.on("SIGINT", () => { void shutdown("SIGINT"); });
process.on("SIGTERM", () => { void shutdown("SIGTERM"); });

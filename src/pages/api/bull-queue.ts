import express from "express";
import { NextApiRequest, NextApiResponse } from "next";

import { createBullBoard } from "@bull-board/api";
import { BullAdapter } from "@bull-board/api/bullAdapter";
import { ExpressAdapter } from "@bull-board/express";

import sendWaQueue from "../../lib/queues/sendWaQueue"; // sesuaikan path queue kamu

let handler: any; // singleton

if (!handler) {
  const serverAdapter = new ExpressAdapter();
  serverAdapter.setBasePath("/api/bull-queue"); // ganti path di sini

  createBullBoard({
    queues: [new BullAdapter(sendWaQueue)],
    serverAdapter,
  });

  const app = express();
  app.use("/api/bull-queue", serverAdapter.getRouter()); // sesuaikan juga di sini

  handler = app;
}

export default (req: NextApiRequest, res: NextApiResponse) => {
  return handler(req, res);
};

export const config = {
  api: {
    bodyParser: false,
    externalResolver: true,
  },
};

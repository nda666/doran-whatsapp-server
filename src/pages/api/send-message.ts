// import makeWASocket, { deleteSession } from "@/lib/makeWASocket";

import { NextApiResponse } from "next";

import type { Phone } from "@prisma/client";
import sendMessageFromIo from "@/server/libs/sendMessageFromIo";
import { AuthNextApiRequest } from "@/types/global";
import { SendMessageValidation } from "@/validations/sendMessage";
import { DispatchError, enqueueDispatch, prepareDispatch, existingRequestJob, requestJobId } from "@/server/dispatch/queue";
import { DispatchAuthError, resolveDispatchDevice } from "@/server/dispatchAuth";
import { hasEnabledSenderGroup } from "@/server/dispatch/senderGroups";

let retry = 0;
interface SendMessageRequest extends AuthNextApiRequest {
  body: {
    number?: string;
    message?: string;
    api_key?: string;
    device_id?: string;
    token_api?: string;
    image?: any;
    phoneCountry?: string;
    dry_run?: boolean;
    transaction_id?: string;
    job_id?: string;
    store_id?: string;
    message_key?: string;
  };
}

const handler = async (req: SendMessageRequest, res: NextApiResponse) => {
  if (!["GET", "POST"].includes(req.method || "")) {
    res.status(405).json({ result: false, curl_error: null, message: "Metode tidak diizinkan." });
    return;
  }
  // return res.status(2result00).json({'req': req.files});

  retry = 0;
  const input = req.method === "GET" ? req.query : req.body;
  req.body = { ...input };
  try { requestJobId(req.body); }
  catch (error) { return res.status(400).json({ result: false, curl_error: null, message: (error as Error).message }); }
  if (req.body.job_id !== undefined && process.env.DISPATCH_QUEUE_ENABLED !== "true") {
    return res.status(503).json({ result: false, curl_error: null, message: "job_id membutuhkan antrean pengiriman aktif." });
  }
  if (process.env.DISPATCH_QUEUE_ENABLED !== "true") {
    const validation = await SendMessageValidation(req.body);
    if (!validation?.result) return res.status(200).json({ result: false, curl_error: null, message: "Parameter pengiriman tidak valid." });
  }
  await sendMessage(req, res);
};

const sendMessage = async (req: SendMessageRequest, res: NextApiResponse) => {
  const { number, message, phoneCountry, image } = req.body || {};
  const tos = typeof number === "string" ? number.split(",") : [];
  let phone: Phone;
  try {
    const resolved = await resolveDispatchDevice(req, req.body);
    phone = resolved.phone;
    req.body.api_key = resolved.token;
  } catch (error) {
    if (!(error instanceof DispatchAuthError)) throw error;
    // Keep the legacy send endpoint's HTTP 200 invalid-token envelope.
    return res.status(error.invalidToken ? 200 : error.status).json({ result: false, curl_error: null, message: error.message });
  }

  if (req.body.dry_run === true) {
    try { if (process.env.DISPATCH_QUEUE_ENABLED === "true") prepareDispatch(phone.id, phone.userId, req.body); }
    catch (error) { return res.status(400).json({ result: false, curl_error: null, message: (error as Error).message }); }
    return res.status(200).json({
      result: true,
      dry_run: true,
      whatsapp_enabled: process.env.WHATSAPP_ENABLED !== "false",
      active: phone.active === 1,
      online: phone.isOnline,
      recipient_count: tos.length,
      queue_enabled: process.env.DISPATCH_QUEUE_ENABLED === "true",
      deduplication_enabled: !!req.body.job_id || !!req.body.transaction_id,
      message: "Request dan token valid. Tidak ada pesan yang dikirim.",
    });
  }

  const url = process.env.NEXT_PUBLIC_APP_URL?.toString();
  if (process.env.DISPATCH_QUEUE_ENABLED === "true") {
    try {
      const previous = await existingRequestJob(phone.id, req.body);
      if (previous) return res.status(200).json(previous);
      if (phone.active !== 1 && !await hasEnabledSenderGroup(phone)) return res.status(409).json({ result: false, curl_error: null, message: "Perangkat nonaktif. Aktifkan sebelum mengirim." });
      return res.status(200).json(await enqueueDispatch(phone.id, phone.userId, req.body));
    }
    catch (error) { return res.status(error instanceof DispatchError ? error.status : 503).json({ result: false, curl_error: null, message: error instanceof DispatchError ? error.message : "Request belum tersimpan. Ulangi dengan ID transaksi yang sama." }); }
  }

  try {
    const resSocket = await sendMessageFromIo({
      phoneId: phone.id,
      userId: phone.userId,
      tos,
      phoneCountry: phoneCountry || "ID",
      message: message || "",
      image,
    });

    res.status(200).json({ result: true, data: resSocket });
  } catch (err) {
    res.status(200).json({ result: false, curl_error: null, message: "Pengiriman gagal. Periksa status perangkat dan hasil di nomor tujuan sebelum mencoba lagi." });
  }
};

// const handler = async (req: NextApiRequest, res: NextApiResponse) => {
//   return res.status(200).json("ok");
// }

export default handler;

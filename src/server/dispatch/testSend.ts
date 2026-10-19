import { createHash, randomUUID } from "node:crypto";
import { prisma } from "../../lib/prisma";
import { matchesTestMedia, testSendRequest } from "../../lib/testSend";
import { publicPayload, payloadContent } from "../campaigns/content";
import { createDispatches } from "../dispatchWebhook/events";
import { DispatchError, prepareDispatch, dispatchResponse } from "./queue";

export async function prepareTestContent(input: ReturnType<typeof testSendRequest.parse>, userId: string) {
  let mediaId: string | null = null;
  let payload: ReturnType<typeof publicPayload.parse> | undefined;
  if (["image", "video", "audio", "document", "sticker"].includes(input.type)) {
    if (!input.mediaId) throw new DispatchError(400, "Pilih file untuk tipe pesan ini.");
    const media = await prisma.mediaAsset.findFirst({ where: { id: input.mediaId, userId } });
    if (!media || !matchesTestMedia(input.type, media.mime)) throw new DispatchError(400, "File tidak tersedia atau formatnya tidak sesuai tipe pesan.");
    mediaId = media.id;
    if (input.type === "sticker") payload = { kind: "sticker" };
  } else if (input.type !== "text") {
    if (!input.payload || typeof input.payload !== "object" || Array.isArray(input.payload)) throw new DispatchError(400, "Isi detail pesan.");
    const parsed = publicPayload.safeParse({ ...input.payload, kind: input.type });
    if (!parsed.success) throw new DispatchError(400, "Detail pesan tidak valid. Periksa kembali isian.");
    payload = parsed.data;
    if ((payload.kind === "button" || payload.kind === "list") && payload.text.length > 1000) throw new DispatchError(400, "Pesan test maksimal 1.000 karakter.");
    if (payload.kind === "button" && new Set(payload.buttons.map(button => button.id)).size !== payload.buttons.length) throw new DispatchError(400, "ID tombol harus unik.");
    if (payload.kind === "list" && new Set(payload.rows.map(row => row.id)).size !== payload.rows.length) throw new DispatchError(400, "ID pilihan harus unik.");
    try { payloadContent(payload); } catch { throw new DispatchError(400, "Pilihan polling harus unik dan jumlah pilihan yang dapat dipilih tidak boleh melebihi jumlah opsi."); }
  } else if (!input.message.trim()) throw new DispatchError(400, "Isi pesan test maksimal 1.000 karakter.");
  return { mediaId, payload };
}

export async function enqueueTestContent(phoneId: string, userId: string, recipient: string, input: ReturnType<typeof testSendRequest.parse>, content: Awaited<ReturnType<typeof prepareTestContent>>) {
  const prepared = prepareDispatch(phoneId, userId, { number: recipient, message: input.message.trim() || `[Test ${input.type}]`, transaction_id: randomUUID(), store_id: "dashboard-test" });
  const jobs = prepared.jobs.map(job => ({ ...job, ...content, payloadHash: createHash("sha256").update(JSON.stringify([job.message, content.mediaId, content.payload || null])).digest("hex") }));
  const stored = await prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId} FOR UPDATE`;
    if (await tx.waDispatch.count({ where: { status: { in: ["QUEUED", "PROCESSING"] } } }) >= 100000) throw new DispatchError(503, "Antrean penuh; coba lagi nanti.");
    await tx.waSenderLease.createMany({ data: [{ phoneId }], skipDuplicates: true });
    await createDispatches(tx, { data: jobs });
    return tx.waDispatch.findMany({ where: { id: { in: jobs.map(job => job.id) } } });
  }, { timeout: 20000 });
  return dispatchResponse(prepared, stored);
}

import type { NextApiResponse } from "next";
import apiAuthMiddleware from "@/middleware/apiAuthMiddleware";
import { AuthNextApiRequest } from "@/types/global";
import { prisma } from "@/lib/prisma";
import { ownerScope } from "@/lib/access";
import { z } from "zod";
import { publicChatMessage } from "@/server/chat/public";
import fs from "node:fs/promises";
import { chatMediaPath } from "@/server/chat/media";

export default apiAuthMiddleware(async (req: AuthNextApiRequest, res: NextApiResponse) => {
  res.setHeader("Cache-Control", "no-store");
  const id = z.string().uuid().safeParse(req.query.id);
  if (!id.success) return res.status(400).json({ message: "Percakapan tidak valid." });
  if (!["GET", "PATCH", "DELETE"].includes(req.method || "")) return res.status(405).end();
  const conversation = await prisma.chatConversation.findFirst({ where: { id: id.data, ...ownerScope(req.user!), phone: ownerScope(req.user!) } });
  if (!conversation) return res.status(404).json({ message: "Percakapan tidak ditemukan." });
  if (req.method === "DELETE") {
    const result = await prisma.$transaction(async tx => {
      // Serialize with capture/send so messages and their files are deleted together.
      await tx.$queryRaw`SELECT id FROM phones WHERE id = ${conversation.phoneId} FOR UPDATE`;
      const current = await tx.chatConversation.findFirst({ where: { id: conversation.id, ...ownerScope(req.user!), phone: ownerScope(req.user!) } });
      if (!current) return { status: 404 as const, files: [] };
      if (await tx.chatMessage.count({ where: { conversationId: current.id, status: "SENDING" } })) return { status: 409 as const, files: [] };
      const media = await tx.chatMessage.findMany({ where: { conversationId: current.id, mediaPath: { not: null } }, select: { mediaPath: true } });
      await tx.chatConversation.delete({ where: { id: current.id } });
      return { status: 200 as const, files: media.map(row => row.mediaPath!) };
    });
    if (result.status === 404) return res.status(404).json({ message: "Percakapan tidak ditemukan." });
    if (result.status === 409) return res.status(409).json({ message: "Pesan masih dalam proses pengiriman. Tunggu sampai selesai sebelum menghapus percakapan." });
    // Only unlink after commit; uploaded source assets can be shared and are retained.
    await Promise.all(result.files.map(async filename => {
      try { await fs.unlink(chatMediaPath(filename)); }
      catch (error: any) { if (error.code !== "ENOENT") console.error("Conversation media cleanup failed:", error.message); }
    }));
    return res.json({ success: true });
  }
  if (req.method === "GET") {
    const cursorId = z.string().uuid().optional().safeParse(req.query.before);
    if (!cursorId.success) return res.status(400).json({ message: "Penanda pesan tidak valid." });
    const cursor = cursorId.data ? await prisma.chatMessage.findFirst({ where: { id: cursorId.data, conversationId: conversation.id } }) : null;
    if (cursorId.data && !cursor) return res.status(404).json({ message: "Pesan tidak ditemukan." });
    const rows = await prisma.chatMessage.findMany({ where: { conversationId: conversation.id, ...(cursor ? { OR: [{ createdAt: { lt: cursor.createdAt } }, { createdAt: cursor.createdAt, id: { lt: cursor.id } }] } : {}) },
      take: 61, orderBy: [{ createdAt: "desc" }, { id: "desc" }] });
    const hasMore = rows.length > 60;
    return res.json({ conversation, data: rows.slice(0, 60).reverse().map(publicChatMessage), hasMore });
  }
  const body = z.discriminatedUnion("action", [z.object({ action: z.literal("read"), through: z.string().uuid() }), z.object({ action: z.literal("archive"), archived: z.boolean() })]).safeParse(req.body);
  if (!body.success) return res.status(400).json({ message: "Perubahan percakapan tidak valid." });
  if (body.data.action === "archive") {
    await prisma.chatConversation.update({ where: { id: conversation.id }, data: { archived: body.data.archived } });
  } else {
    const through = await prisma.chatMessage.findFirst({ where: { id: body.data.through, conversationId: conversation.id } });
    if (!through) return res.status(404).json({ message: "Pesan tidak ditemukan." });
    await prisma.$transaction(async tx => {
      // Same lock order as message capture: don't clear unread messages arriving during a read request.
      await tx.$queryRaw`SELECT id FROM phones WHERE id = ${conversation.phoneId} FOR UPDATE`;
      await tx.chatMessage.updateMany({ where: { conversationId: conversation.id, direction: "IN", status: "RECEIVED",
        OR: [{ createdAt: { lt: through.createdAt } }, { createdAt: through.createdAt, id: { lte: through.id } }] }, data: { status: "READ" } });
      const unreadCount = await tx.chatMessage.count({ where: { conversationId: conversation.id, direction: "IN", status: "RECEIVED" } });
      await tx.chatConversation.update({ where: { id: conversation.id }, data: { unreadCount } });
    });
  }
  return res.json({ success: true });
});


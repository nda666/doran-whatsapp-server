import type { NextApiResponse } from "next";
import apiAuthMiddleware from "@/middleware/apiAuthMiddleware";
import { AuthNextApiRequest } from "@/types/global";
import { ownerScope, conversationScope } from "@/lib/access";
import { z } from "zod";
import { sendChatReply, ChatSendError } from "@/server/chat/send";
import { publicChatMessage } from "@/server/chat/public";

export default apiAuthMiddleware(async (req: AuthNextApiRequest, res: NextApiResponse) => {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).end();
  const id = z.string().uuid().safeParse(req.query.id);
  const body = z.object({ requestId: z.string().uuid(), text: z.string().max(10000).default(""), mediaId: z.string().uuid().optional(), replyToId: z.string().uuid().optional() }).refine(v => v.text.trim() || v.mediaId).safeParse(req.body);
  if (!id.success || !body.success) return res.status(400).json({ message: "Isi pesan atau pilih lampiran. Pesan maksimal 10.000 karakter." });
  try {
    const row = await sendChatReply(id.data, conversationScope(req.user!), body.data, ownerScope(req.user!));
    return res.json(publicChatMessage(row));
  } catch (error) {
    if (error instanceof ChatSendError) return res.status(error.status).json({ message: error.message });
    throw error;
  }
});

import type { NextApiResponse } from "next";
import apiAuthMiddleware from "@/middleware/apiAuthMiddleware";
import { AuthNextApiRequest } from "@/types/global";
import { conversationScope as ownerScope } from "@/lib/access";
import { z } from "zod";
import { updateChatTyping } from "@/server/chat/typing";

export default apiAuthMiddleware(async (req: AuthNextApiRequest, res: NextApiResponse) => {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).end();
  const id = z.string().uuid().safeParse(req.query.id);
  const body = z.object({ clientId: z.string().uuid(), typing: z.boolean() }).safeParse(req.body);
  if (!id.success || !body.success) return res.status(400).json({ message: "Status mengetik tidak valid." });
  const result = await updateChatTyping(id.data, ownerScope(req.user!), body.data.clientId, body.data.typing);
  if (!result) return res.status(404).json({ message: "Percakapan tidak ditemukan." });
  return res.json(result);
});

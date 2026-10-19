import { createHash, randomUUID } from "node:crypto";
import type { AutoReply, Phone } from "@prisma/client";
import type { WAMessage, WASocket } from "@whiskeysockets/baileys";
import { prisma } from "../../lib/prisma";
import { aiRuleInput, type AiProvider } from "../../lib/aiPlugins";
import { isApproved } from "../../lib/access";
import { decryptAiKey } from "./secrets";
import { AiError, generateAiText } from "./providers";
import { phoneMaintenance, retiredSockets } from "../libs/phoneMaintenance";
import { captureChatMessage } from "../chat/store";

export async function requestAiReply(userId: string, provider: AiProvider, message: string, instructions = "", dedupe: string = randomUUID()) {
  if (!message.trim() || message.length > 4000) throw new AiError("AI_INPUT", "Pesan AI wajib diisi, maksimal 4.000 karakter.");
  const dedupeKey = createHash("sha256").update(JSON.stringify([userId, dedupe])).digest("hex");
  const claimed = await prisma.$transaction(async tx => {
    // Serialize quota admission across workers and devices belonging to this owner.
    await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId} FOR UPDATE`;
    const user = await tx.user.findUnique({ where: { id: userId } });
    if (!user || !isApproved(user)) throw new AiError("AI_ACCOUNT", "Akun tidak aktif.", 403);
    if (await tx.aiRequest.findUnique({ where: { dedupeKey } })) return null;
    const config = await tx.aiPlugin.findUnique({ where: { userId_provider: { userId, provider } } });
    if (!config?.enabled || !config.encryptedKey) throw new AiError("AI_DISABLED", "Plugin AI belum aktif atau API key belum diisi.");
    const now = new Date();
    // Daily quota resets at midnight in Jakarta, independent of server timezone.
    const dayStart = new Date(Math.floor((now.getTime() + 7 * 3600000) / 86400000) * 86400000 - 7 * 3600000);
    const [minute, day] = await Promise.all([
      tx.aiRequest.count({ where: { userId, provider, createdAt: { gte: new Date(now.getTime() - 60000) } } }),
      tx.aiRequest.count({ where: { userId, provider, createdAt: { gte: dayStart } } }),
    ]);
    if (minute >= config.requestsPerMinute || day >= config.dailyLimit) throw new AiError("AI_RATE_LIMIT", "Batas permintaan AI per menit atau per hari tercapai.", 429);
    const request = await tx.aiRequest.create({ data: { userId, provider, dedupeKey, status: "PROCESSING" } });
    return { request, config };
  });
  if (!claimed) return null;
  const { request, config } = claimed;
  try {
    const apiKey = decryptAiKey(config.encryptedKey);
    const text = await generateAiText({ provider, apiKey, model: config.model,
      systemPrompt: [config.systemPrompt, instructions].filter(Boolean).join("\n\n"), message, maxOutputTokens: config.maxOutputTokens });
    await prisma.aiRequest.update({ where: { id: request.id }, data: { status: "GENERATED" } });
    return { text, requestId: request.id, configId: config.id, revision: config.updatedAt };
  } catch (error) {
    const safeError = error instanceof AiError ? error : new AiError("AI_CONFIGURATION", "API key AI tidak dapat dibaca. Periksa AI_SECRET_KEY server dan simpan ulang API key.");
    await prisma.aiRequest.update({ where: { id: request.id }, data: { status: "FAILED", error: safeError.code } });
    throw safeError;
  }
}

/** Called only for live notify events. Durable dedupe prevents a second AI reply on redelivery. */
export async function sendAiAutoReply(rule: AutoReply, phone: Phone, socket: WASocket, message: WAMessage, text: string) {
  const jid = message.key.remoteJid, messageId = message.key.id;
  if (!jid || !messageId || message.key.fromMe || !/@(s\.whatsapp\.net|lid|g\.us)$/.test(jid) || !text.trim() || text.length > 4000) return;
  const seconds = Number(message.messageTimestamp);
  if (!Number.isFinite(seconds) || seconds * 1000 < Date.now() - 5 * 60000 || seconds * 1000 > Date.now() + 60000) return;
  if ((rule.reply_when === "Group" && !jid.endsWith("@g.us")) || (rule.reply_when === "Personal" && jid.endsWith("@g.us"))) return;
  const parsed = aiRuleInput.safeParse(rule.reply);
  if (!parsed.success) return;
  const stillActive = async () => {
    if (process.env.WHATSAPP_ENABLED === "false" || process.env.DORAN_SHUTTING_DOWN === "true" || phoneMaintenance.has(phone.id) || retiredSockets.has(socket) || !socket.ws.isOpen) return false;
    const current = await prisma.autoReply.findFirst({ where: { id: rule.id, userId: phone.userId, phoneId: phone.id,
      type: "ai", reply_status: "active", phone: { active: 1, autoReplyEnabled: true, user: { isActive: true, approvalStatus: "APPROVED" } } } });
    // sentCount updates updatedAt too; compare configuration so parallel replies remain valid.
    const currentConfig = aiRuleInput.safeParse(current?.reply);
    return !!current && currentConfig.success && currentConfig.data.provider === parsed.data.provider && currentConfig.data.instructions === parsed.data.instructions &&
      current.keyword === rule.keyword && current.type_keyword === rule.type_keyword && current.reply_when === rule.reply_when &&
      current.delaySeconds === rule.delaySeconds && current.is_quoted === rule.is_quoted;
  };
  if (rule.delaySeconds) await new Promise(resolve => setTimeout(resolve, rule.delaySeconds * 1000));
  if (!await stillActive()) return;
  const result = await requestAiReply(phone.userId, parsed.data.provider, text, parsed.data.instructions, JSON.stringify([phone.id, jid, messageId]));
  if (!result) return;
  let sendStarted = false;
  try {
    const plugin = await prisma.aiPlugin.findUnique({ where: { id: result.configId } });
    if (!plugin?.enabled || plugin.updatedAt.getTime() !== result.revision.getTime() || !await stillActive()) {
      await prisma.aiRequest.update({ where: { id: result.requestId }, data: { status: "CANCELLED" } });
      return;
    }
    if (phone.showTyping) {
      await socket.sendPresenceUpdate("composing", jid).catch(() => {});
      await new Promise(resolve => setTimeout(resolve, 1500));
    }
    const latestPlugin = await prisma.aiPlugin.findUnique({ where: { id: result.configId } });
    if (!latestPlugin?.enabled || latestPlugin.updatedAt.getTime() !== result.revision.getTime() || !await stillActive()) {
      await prisma.aiRequest.update({ where: { id: result.requestId }, data: { status: "CANCELLED" } });
      return;
    }
    sendStarted = true;
    const sent = await socket.sendMessage(jid, { text: result.text }, rule.is_quoted ? { quoted: message } : undefined);
    if (!sent?.key.id) throw new Error("AI_SEND_NO_ID");
    await prisma.aiRequest.update({ where: { id: result.requestId }, data: { status: "SENT" } });
    await prisma.autoReply.updateMany({ where: { id: rule.id, userId: phone.userId }, data: { sentCount: { increment: 1 } } });
    await captureChatMessage(phone.id, { ...sent, key: { ...sent.key, fromMe: true } }, socket).catch(() => console.error("AI_CHAT_SAVE_FAILED"));
  } catch {
    await prisma.aiRequest.update({ where: { id: result.requestId }, data: { status: sendStarted ? "UNCERTAIN" : "FAILED", error: "AI_SEND_FAILED" } });
  } finally {
    if (phone.showTyping) await socket.sendPresenceUpdate("paused", jid).catch(() => {});
  }
}

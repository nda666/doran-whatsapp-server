import type { WASocket } from "@whiskeysockets/baileys";
import { prisma } from "../../lib/prisma";
import { session } from "../libs/makeWASocket";
import { phoneMaintenance } from "../libs/phoneMaintenance";

type TypingState = { phoneId: string; jid: string; clients: Map<string, ReturnType<typeof setTimeout>>; lastSent: number };
const shared = globalThis as typeof globalThis & { doranChatTyping?: Map<string, TypingState> };
const states = shared.doranChatTyping || (shared.doranChatTyping = new Map<string, TypingState>());

async function presence(socket: WASocket | undefined, jid: string, typing: boolean) {
  if (socket?.ws.isOpen) await socket.sendPresenceUpdate(typing ? "composing" : "paused", jid).catch(() => {});
}

export async function updateChatTyping(conversationId: string, scope: { userId?: string }, clientId: string, typing: boolean) {
  const conversation = await prisma.chatConversation.findFirst({ where: { id: conversationId, ...scope, phone: scope }, include: { phone: true } });
  if (!conversation) return null;
  const { phone, jid } = conversation;
  const socket = session.get(phone.id);
  const allowed = phone.showTyping && phone.saveIncomingMessages && phone.active === 1 && !phoneMaintenance.has(phone.id) && socket?.ws.isOpen && !!socket.user;
  let state = states.get(conversationId);
  if (!allowed) {
    if (state) {
      state.clients.forEach(timer => clearTimeout(timer));
      states.delete(conversationId);
      await presence(socket, jid, false);
    }
    return { active: false };
  }
  if (!typing) {
    const timer = state?.clients.get(clientId);
    if (timer) clearTimeout(timer);
    state?.clients.delete(clientId);
    if (state && !state.clients.size) {
      states.delete(conversationId);
      await presence(socket, jid, false);
    }
    return { active: !!state?.clients.size };
  }
  if (!state) {
    if (states.size >= 2000) return { active: false };
    state = { phoneId: phone.id, jid, clients: new Map(), lastSent: 0 };
    states.set(conversationId, state);
  }
  if (!state.clients.has(clientId) && state.clients.size >= 16) return { active: true };
  const oldTimer = state.clients.get(clientId);
  if (oldTimer) clearTimeout(oldTimer);
  const current = state;
  const timer = setTimeout(() => {
    if (states.get(conversationId) !== current) return;
    current.clients.delete(clientId);
    if (!current.clients.size) {
      states.delete(conversationId);
      void presence(session.get(phone.id), jid, false);
    }
  }, 8000);
  timer.unref?.();
  state.clients.set(clientId, timer);
  // Multiple tabs/operators share one WA chat-state notification stream.
  if (!state.lastSent || Date.now() - state.lastSent >= 3000) {
    state.lastSent = Date.now();
    await presence(socket, jid, true);
  }
  return { active: true };
}

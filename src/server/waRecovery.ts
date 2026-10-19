import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { prisma } from "../lib/prisma";
import makeWASocket, { session, waitForAuthSave, waitForPendingSocket } from "./libs/makeWASocket";
import { phoneMaintenance, retiredSockets } from "./libs/phoneMaintenance";
import { waRecovery } from "./libs/waRecoveryState";

export const WA_RECOVERY_INTERVAL_MS = 30_000;
const CONNECT_DEADLINE_MS = 120_000;
let running = false;

async function hasLinkedAuth(userId: string, phoneId: string) {
  try {
    const creds = JSON.parse(await readFile(join(process.env.WHATSAPP_AUTH_FOLDER || "./storage/whatsapp-auth", `${userId}-${phoneId}`, "creds.json"), "utf8"));
    return !!creds.me?.id;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

export async function recoverWaConnections() {
  if (running || process.env.WHATSAPP_ENABLED === "false" || process.env.DORAN_SHUTTING_DOWN === "true") return;
  running = true;
  try {
    const phones = await prisma.phone.findMany({ where: { active: 1 }, select: { id: true, userId: true } });
    for (const phone of phones) {
      if (process.env.DORAN_SHUTTING_DOWN === "true" || process.env.WHATSAPP_ENABLED === "false") break;
      if (phoneMaintenance.has(phone.id) || waRecovery.blocked.has(phone.id) || waRecovery.timers.has(phone.id)) continue;
      try {
        await waitForPendingSocket(phone.userId, phone.id);
        const socket = session.get(phone.id);
        if (socket) {
          // Leave QR generation and ongoing pairing to their normal lifecycle.
          if (!socket.authState.creds.me?.id) continue;
          const health = waRecovery.sockets.get(socket);
          const stuck = health && !health.connected && Date.now() - health.createdAt >= CONNECT_DEADLINE_MS;
          if (!socket.ws.isClosed && !socket.ws.isClosing && !stuck) continue;
          retiredSockets.add(socket);
          session.delete(phone.id);
          socket.end(new Error("WA_RECOVERY_STALE_SOCKET"));
          await waitForAuthSave(socket);
        }
        if (phoneMaintenance.has(phone.id) || waRecovery.blocked.has(phone.id) || waRecovery.timers.has(phone.id)) continue;
        if (!(await hasLinkedAuth(phone.userId, phone.id))) continue;
        console.info("WA_AUTO_RECOVERY", JSON.stringify({ phoneId: phone.id }));
        await makeWASocket(phone.userId, phone.id);
      } catch (error) {
        console.error("WA_AUTO_RECOVERY_FAILED", phone.id, error instanceof Error ? error.message : "Unknown error");
      }
    }
  } finally { running = false; }
}

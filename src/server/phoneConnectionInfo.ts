import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describePhoneConnection } from "../lib/phoneConnectionStatus";
import { session } from "./libs/makeWASocket";
import { phoneMaintenance } from "./libs/phoneMaintenance";
import { isPairingInProgress } from "./libs/pairingState";
import { waRecovery } from "./libs/waRecoveryState";

export async function getPhoneConnectionInfo(phone: { id: string; userId: string; active: number }) {
  const socket = session.get(phone.id);
  const health = socket && waRecovery.sockets.get(socket);
  const online = !!socket?.ws.isOpen && !!health?.connected;
  const maintenance = phoneMaintenance.has(phone.id);
  const pairing = isPairingInProgress(phone.id);
  const enabled = process.env.WHATSAPP_ENABLED !== "false";
  let linked: boolean | null = socket?.authState.creds.me?.id ? true : null;
  if (linked === null && phone.active === 1 && enabled && !maintenance && !online && !pairing) {
    try {
      const creds = JSON.parse(await readFile(join(process.env.WHATSAPP_AUTH_FOLDER || "./storage/whatsapp-auth", `${phone.userId}-${phone.id}`, "creds.json"), "utf8"));
      // Valid JSON with an unexpected structure is an inspection failure.
      linked = creds && typeof creds === "object" && !Array.isArray(creds) ? !!creds.me?.id : null;
    } catch (error) {
      linked = (error as NodeJS.ErrnoException).code === "ENOENT" ? false : null;
    }
  }
  return describePhoneConnection({ active: phone.active === 1, enabled, maintenance, online, pairing, linked,
    retrying: waRecovery.timers.has(phone.id) || (!!socket && !!health && !health.connected && linked === true),
    blockedCode: waRecovery.blocked.has(phone.id) ? waRecovery.disconnects?.get(phone.id)?.code : undefined,
  });
}

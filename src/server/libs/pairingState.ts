import type { ConnectionState } from "@whiskeysockets/baileys";

export type PairingPhase = "qr" | "pairing" | "connected" | "error";
type Progress = { phase: PairingPhase; updatedAt: number };
const shared = globalThis as typeof globalThis & { doranPairingProgress?: Map<string, Progress> };
const progress = shared.doranPairingProgress || (shared.doranPairingProgress = new Map<string, Progress>());

export function pairingPhase(update: Partial<ConnectionState>, previous?: PairingPhase): PairingPhase | undefined {
  const status = (update.lastDisconnect?.error as any)?.output?.statusCode;
  if (update.connection === "open") return "connected";
  if (update.connection === "close") {
    // Baileys restartRequired (515) is the normal socket restart after pairing.
    if (status === 515) return "pairing";
    if (previous === "pairing" && ![401, 403, 411, 440, 500].includes(status)) return "pairing";
    return "error";
  }
  if (update.isNewLogin) return "pairing";
  if (update.qr) return "qr";
}

export function recordPairingProgress(phoneId: string, update: Partial<ConnectionState>) {
  const phase = pairingPhase(update, progress.get(phoneId)?.phase);
  if (phase) progress.set(phoneId, { phase, updatedAt: Date.now() });
  return phase;
}

export function isPairingInProgress(phoneId: string) {
  const state = progress.get(phoneId);
  return state?.phase === "pairing" && Date.now() - state.updatedAt < 120_000;
}

export function clearPairingProgress(phoneId: string) { progress.delete(phoneId); }

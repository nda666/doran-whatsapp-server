import type { WASocket } from "@whiskeysockets/baileys";

// Next API bundles and the custom server must coordinate recovery in one process.
const shared = globalThis as typeof globalThis & { doranWaRecovery?: {
  attempts: Map<string, number>;
  timers: Map<string, NodeJS.Timeout>;
  blocked: Set<string>;
  disconnects: Map<string, { code?: number; at: number }>;
  sockets: WeakMap<WASocket, { createdAt: number; connected: boolean }>;
} };
export const waRecovery = shared.doranWaRecovery || (shared.doranWaRecovery = {
  attempts: new Map(), timers: new Map(), blocked: new Set(), disconnects: new Map(), sockets: new WeakMap(),
});

import type { WASocket } from "@whiskeysockets/baileys";
const shared = globalThis as typeof globalThis & {
  doranPhoneMaintenance?: Set<string>; doranRetiredSockets?: WeakSet<WASocket>;
};
export const phoneMaintenance = shared.doranPhoneMaintenance || (shared.doranPhoneMaintenance = new Set<string>());
export const retiredSockets = shared.doranRetiredSockets || (shared.doranRetiredSockets = new WeakSet<WASocket>());

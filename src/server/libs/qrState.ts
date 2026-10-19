import type { ConnectionState, WASocket } from "@whiskeysockets/baileys";

type QrState = { qr?: string; expiresAt?: number; connection?: string; pairing?: boolean };
const shared = globalThis as typeof globalThis & { doranQrStates?: WeakMap<WASocket, QrState> };
const states = shared.doranQrStates || (shared.doranQrStates = new WeakMap<WASocket, QrState>());

export function recordQrState(socket: WASocket, update: Partial<ConnectionState>, lifetime: number) {
  const state = states.get(socket) || {};
  if (update.connection) state.connection = update.connection;
  if (update.isNewLogin || (update.lastDisconnect?.error as any)?.output?.statusCode === 515) state.pairing = true;
  if (update.connection === "close" && [401, 403, 411, 440, 500].includes((update.lastDisconnect?.error as any)?.output?.statusCode)) state.pairing = false;
  if (update.qr) {
    state.qr = update.qr;
    state.expiresAt = Date.now() + lifetime;
    state.pairing = false;
  }
  if (update.connection === "open" || update.connection === "close") {
    delete state.qr;
    delete state.expiresAt;
  }
  states.set(socket, state);
  if (update.connection === "open") state.pairing = false;
  if (update.isNewLogin) {
    delete state.qr;
    delete state.expiresAt;
  }
}

export function waitForQr(socket: WASocket, waitMs = 20_000): Promise<{ qr?: string; connected?: boolean; pairing?: boolean; timeout: number }> {
  return new Promise((resolve, reject) => {
    let timer: NodeJS.Timeout | undefined;
    const finish = (error?: Error, result?: { qr?: string; connected?: boolean; pairing?: boolean; timeout: number }) => {
      if (timer) clearTimeout(timer);
      socket.ev.off("connection.update", check);
      if (error) reject(error);
      else resolve(result!);
    };
    const check = () => {
      const state = states.get(socket);
      if (state?.connection === "open") return finish(undefined, { connected: true, timeout: 0 });
      if (state?.pairing) return finish(undefined, { pairing: true, timeout: 0 });
      if (state?.connection === "close") return finish(new Error("Koneksi WhatsApp terputus. Silakan coba lagi."));
      const remaining = (state?.expiresAt || 0) - Date.now();
      if (state?.qr && remaining > 5_000) finish(undefined, { qr: state.qr, timeout: remaining });
    };
    socket.ev.on("connection.update", check);
    timer = setTimeout(() => finish(new Error("QR belum tersedia. Silakan coba lagi.")), waitMs);
    check();
  });
}

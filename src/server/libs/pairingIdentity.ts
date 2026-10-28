import type { WASocket } from "@whiskeysockets/baileys";

type IdentitySocket = Pick<WASocket, "user" | "ws">;
type DeviceIdentity = { id: string; number: string | null; active: number; isOnline: boolean };
const shared = globalThis as typeof globalThis & {
  doranPairingIdentities?: WeakMap<object, { expected: string | null }>;
  doranRejectedPairings?: Set<string>;
};
const identities = shared.doranPairingIdentities || (shared.doranPairingIdentities = new WeakMap());
export const rejectedPairings = shared.doranRejectedPairings || (shared.doranRejectedPairings = new Set());

export function registeredPairingNumber(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const compact = value.replace(/[+()\s.-]/g, "");
  return /^[1-9]\d{4,14}$/.test(compact) ? compact : null;
}

export function actualPairingNumber(socket?: IdentitySocket): string | null {
  const jid = socket?.user?.id;
  if (typeof jid !== "string" || !/^\d+(?::\d+)?@s\.whatsapp\.net$/.test(jid)) return null;
  return registeredPairingNumber(jid.split("@")[0].split(":")[0]);
}

export function bindPairingIdentity(socket: IdentitySocket, registered: string | null): void {
  if (!identities.has(socket)) identities.set(socket, { expected: registered === null || registered === "" ? null : registeredPairingNumber(registered) || "" });
}

export function expectedPairingNumber(socket: IdentitySocket): string | null {
  return identities.get(socket)?.expected ?? null;
}

export function acceptsPairingIdentity(socket: IdentitySocket): boolean {
  const identity = identities.get(socket), actual = actualPairingNumber(socket);
  if (!identity || !actual) return false;
  // A newly created dashboard device has no number until its first valid pairing.
  if (identity.expected === null) identity.expected = actual;
  return identity.expected === actual;
}

export function pairingSessionIdentity(phone: DeviceIdentity, socket?: IdentitySocket) {
  const accepted = socket ? acceptsPairingIdentity(socket) : false;
  return {
    number_verification: true,
    expected_number: socket ? expectedPairingNumber(socket) : registeredPairingNumber(phone.number),
    actual_number: actualPairingNumber(socket),
    identity_mismatch: rejectedPairings.has(phone.id) || !!(socket?.user && !accepted),
    online: phone.active === 1 && phone.isOnline && !!socket?.ws.isOpen && accepted,
  };
}

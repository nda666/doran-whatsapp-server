import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { normalizePhoneRecipient } from "../../utils/normalizePhoneRecipient";

export function senderNumber(value: string | null | undefined) {
  if (!value) return null;
  const raw = value.split("@")[0].split(":")[0].trim();
  const compact = raw.replace(/[()\s.-]/g, "");
  // Stored WhatsApp IDs already contain a country code, including non-ID ones.
  // Only an explicit local trunk prefix is interpreted as Indonesian.
  try { return normalizePhoneRecipient(compact.startsWith("+") ? compact : `+${compact.startsWith("0") ? "62" + compact.slice(1) : compact}`); }
  catch { return null; }
}

// Reuse the device-change mutex, always before locking groups or phones. Creating
// the disabled default also makes the mutex safe on a fresh installation.
export async function lockSenderMembership(tx: Prisma.TransactionClient) {
  const revision = randomUUID();
  // Unlike INSERT IGNORE followed by SELECT FOR UPDATE, this acquires an
  // exclusive lock immediately and cannot deadlock during a shared-lock upgrade.
  await tx.$executeRaw`INSERT INTO device_webhook_settings (id, enabled, url, secret, revision, updatedAt)
    VALUES (1, false, '', '', ${revision}, NOW(3)) ON DUPLICATE KEY UPDATE id = id`;
}

export const senderMembershipSelect = {
  id: true, name: true, number: true, senderGroupId: true,
  senderGroup: { select: { name: true } },
} as const;

type Member = { id: string; name: string; number: string | null; senderGroupId: string | null; senderGroup?: { name: string } | null };

export function conflictingSender(phone: Pick<Member, "id" | "number" | "senderGroupId">, members: Member[]) {
  const number = senderNumber(phone.number);
  return number ? members.find(other => other.id !== phone.id && other.senderGroupId &&
    other.senderGroupId !== phone.senderGroupId && senderNumber(other.number) === number) : undefined;
}

export function senderNumberConflicts(members: Member[]) {
  return members.flatMap(phone => {
    const other = conflictingSender(phone, members);
    return other ? [{ phoneId: phone.id, deviceName: phone.name, number: senderNumber(phone.number),
      groupId: phone.senderGroupId, groupName: phone.senderGroup?.name || null,
      otherGroupName: other.senderGroup?.name || "Grup lain", otherDeviceName: other.name }] : [];
  });
}

const seen = new Map<string, number>();
const TTL_MS = 3_600_000;
const MAX_ENTRIES = 50_000;

/** True when this inbound message was already processed; Baileys can redeliver the same ID after reconnects or history syncs. */
export function alreadyProcessed(phoneId: string, messageId: string | null | undefined, now = Date.now()) {
  if (!messageId) return false;
  const key = `${phoneId}:${messageId}`;
  const at = seen.get(key);
  if (at !== undefined && now - at < TTL_MS) return true;
  seen.delete(key);
  seen.set(key, now);
  // Map iterates in insertion order, so the oldest entries go first.
  if (seen.size > MAX_ENTRIES) Array.from(seen.keys()).slice(0, seen.size - MAX_ENTRIES + 1000).forEach(oldKey => seen.delete(oldKey));
  return false;
}

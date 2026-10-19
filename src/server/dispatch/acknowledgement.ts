import type { BinaryNode } from "@whiskeysockets/baileys";
import { ACK_TIMEOUT_MS } from "./retry";

export type AckObservation = { tag: string | null; code: string | null };

// TAG:id can carry another stanza before the server ACK. Keep listening rather
// than interpreting the first matching stanza as a failed message.
export async function waitForDispatchAcknowledgement(
  wait: (id: string, timeout: number) => Promise<BinaryNode | undefined>,
  id: string,
  observe: (observation: AckObservation) => void,
) {
  const deadline = Date.now() + ACK_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const node = await wait(id, Math.max(1, deadline - Date.now())).catch(() => undefined);
    if (!node) break;
    const code = /^\d{1,4}$/.test(node.attrs?.error || "") ? node.attrs.error : null;
    const tag = /^[a-zA-Z0-9_-]{1,32}$/.test(node.tag || "") ? node.tag : null;
    observe({ tag, code });
    if (node.tag === "ack" && (!node.attrs?.error || node.attrs.error === "0")) return node;
    // Baileys documents 463 as an account reach-out restriction: repeated sends
    // worsen it. Report this explicit rejection instead of retrying it.
    if (node.tag === "ack" && code === "463") return node;
  }
  // The worker owns the single 40s deadline and retry transition. Avoid returning
  // an early missing/invalid ACK as UNCERTAIN or spinning on a closed socket.
  return new Promise<never>(() => {});
}

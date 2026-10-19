import { updateDispatches } from "../dispatchWebhook/events";
import { ACK_EXHAUSTED_ERROR } from "./retry";

export async function recordDispatchReceipt(phoneId: string, messageId: string, level: number) {
  const where = { phoneId, messageId };
  const now = new Date();
  if (level >= 4) await updateDispatches({ where: { ...where, status: { not: "READ" } }, data: { status: "READ", readAt: now, deliveredAt: now, lastError: null } });
  else if (level >= 3) await updateDispatches({ where: { ...where, status: { notIn: ["READ", "DELIVERED"] } }, data: { status: "DELIVERED", deliveredAt: now, lastError: null } });
  else if (level === 2) await updateDispatches({ where: { ...where, OR: [
    { status: { in: ["PROCESSING", "UNCERTAIN", "QUEUED"] } },
    { status: "FAILED", lastError: ACK_EXHAUSTED_ERROR },
  ] }, data: { status: "SENT", sentAt: now, lastError: null } });
}

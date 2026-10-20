import { updateDispatches } from "../dispatchWebhook/events";
import { ACK_EXHAUSTED_ERROR } from "./retry";
import { prisma } from "../../lib/prisma";

export async function recordDispatchReceipt(phoneId: string, messageId: string, level: number) {
  const where = { messageId, AND: [{ OR: [{ senderPhoneId: phoneId }, { senderPhoneId: null, phoneId }] }] };
  const now = new Date();
  if (level >= 4) await updateDispatches({ where: { ...where, status: { not: "READ" } }, data: { status: "READ", readAt: now, deliveredAt: now, lastError: null } });
  else if (level >= 3) await updateDispatches({ where: { ...where, status: { notIn: ["READ", "DELIVERED"] } }, data: { status: "DELIVERED", deliveredAt: now, lastError: null } });
  else if (level === 2) await updateDispatches({ where: { ...where, OR: [
    { status: { in: ["PROCESSING", "UNCERTAIN", "QUEUED"] } },
    { status: "FAILED", lastError: ACK_EXHAUSTED_ERROR },
  ] }, data: { status: "SENT", sentAt: now, lastError: null } });
  if (level >= 2) await prisma.waDispatchAttempt.updateMany({ where: { phoneId, messageId,
    status: { notIn: level >= 4 ? ["READ"] : level >= 3 ? ["READ", "DELIVERED"] : ["READ", "DELIVERED", "SENT"] } },
    data: { status: level >= 4 ? "READ" : level >= 3 ? "DELIVERED" : "SENT", error: null, finishedAt: now } });
}

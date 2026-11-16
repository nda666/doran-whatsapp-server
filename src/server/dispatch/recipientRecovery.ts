import { prisma } from "../../lib/prisma";
import { recipientFrequencyVerdict } from "../messaging/recipientPolicy";
import { getTrafficPolicy } from "./settings";

// Recheck persisted sleeps after the content rule or traffic settings change.
// Waking a row never sends it: the worker still checks all normal send guards.
export async function recoverRecipientFrequencyDispatches(now = new Date()) {
  const waiting = { status: "QUEUED" as const, lastError: "RECIPIENT_FREQUENCY",
    sentAt: null, deliveredAt: null, readAt: null, nextAttemptAt: { gt: now } };
  let cursor: string | undefined;
  let policy: Awaited<ReturnType<typeof getTrafficPolicy>> | undefined;
  for (;;) {
    const jobs = await prisma.waDispatch.findMany({ where: waiting,
      orderBy: { id: "asc" }, take: 100, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: { id: true, userId: true, recipient: true, message: true } });
    if (!jobs.length) return;
    policy ??= await getTrafficPolicy();
    for (const job of jobs) {
      const verdict = await recipientFrequencyVerdict(job.userId, job.recipient, job.message, policy, now);
      if (!verdict) await prisma.waDispatch.updateMany({
        where: { ...waiting, id: job.id }, data: { nextAttemptAt: now, lastError: null },
      });
    }
    cursor = jobs[jobs.length - 1].id;
    if (jobs.length < 100) return;
  }
}

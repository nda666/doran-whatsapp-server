import { prisma } from "../../lib/prisma";
import { isApproved } from "../../lib/access";
import type { TrafficPolicy } from "../../lib/trafficSettings";

const DAY_MS = 86_400_000;
const DELIVERED_STATUSES = ["SENT", "DELIVERED", "READ"] as const;
// Failures that say something about the recipient or route, not about one device being restricted.
const UNREACHABLE_ERRORS = ["ACK_TIMEOUT_RETRY_EXHAUSTED", "ACK_UNKNOWN_CHECK_RECIPIENT"];
export const INVALID_NUMBER_FAILURES = 3;

export type RecipientVerdict =
  | { code: "ACCOUNT_INACTIVE"; retryAt: Date }
  | { code: "CONSENT_REQUIRED" }
  | { code: "INVALID_NUMBER" }
  | { code: "RECIPIENT_FREQUENCY"; retryAt: Date };

/** A disabled or unapproved owner must stop sending even when jobs were queued before the change. */
export async function ownerCanSend(userId: string) {
  const owner = await prisma.user.findUnique({ where: { id: userId }, select: { approvalStatus: true, isActive: true } });
  return !!owner && isApproved(owner);
}

/** Pure decision: three terminal failures over at least two senders, and never a successful send. */
export function looksInvalid(failures: number, senders: number, delivered: number) {
  return delivered === 0 && failures >= INVALID_NUMBER_FAILURES && senders >= 2;
}

/** Checks that must pass before a queued API/campaign message is handed to a transport. */
export async function recipientVerdict(userId: string, recipient: string, policy: TrafficPolicy, now = new Date()): Promise<RecipientVerdict | null> {
  if (!await ownerCanSend(userId)) return { code: "ACCOUNT_INACTIVE", retryAt: new Date(now.getTime() + 300_000) };
  if (policy.requireConsent) {
    const consent = await prisma.recipientConsent.findFirst({ where: { userId, number: recipient, revokedAt: null }, select: { number: true } });
    if (!consent) return { code: "CONSENT_REQUIRED" };
  }
  const delivered = await prisma.waDispatch.count({ where: { userId, recipient, status: { in: [...DELIVERED_STATUSES] }, createdAt: { gt: new Date(now.getTime() - 90 * DAY_MS) } } });
  if (delivered === 0) {
    const failed = await prisma.waDispatch.groupBy({ by: ["senderPhoneId"], where: { userId, recipient, status: { in: ["FAILED", "UNCERTAIN"] }, lastError: { in: UNREACHABLE_ERRORS }, createdAt: { gt: new Date(now.getTime() - 30 * DAY_MS) } }, _count: { _all: true } });
    const total = failed.reduce((sum, row) => sum + row._count._all, 0);
    if (looksInvalid(total, failed.filter(row => row.senderPhoneId).length, delivered)) return { code: "INVALID_NUMBER" };
  }
  if (policy.enabled) {
    const recent = await prisma.waDispatch.findMany({
      where: { userId, recipient, OR: [{ status: "PROCESSING" }, { status: { in: [...DELIVERED_STATUSES] }, sentAt: { gt: new Date(now.getTime() - DAY_MS) } }] },
      orderBy: { sentAt: "asc" }, take: policy.recipientPerDay, select: { sentAt: true },
    });
    if (recent.length >= policy.recipientPerDay) {
      const oldest = recent.find(row => row.sentAt)?.sentAt;
      return { code: "RECIPIENT_FREQUENCY", retryAt: new Date(Math.max(now.getTime() + 60_000, (oldest?.getTime() ?? now.getTime()) + DAY_MS)) };
    }
  }
  return null;
}

import { SendGuardError, recipientBlocked, usageDay } from "../messaging/safety";
import { updateDispatches } from "../dispatchWebhook/events";
import { randomUUID } from "node:crypto";
import { generateMessageIDV2 } from "@whiskeysockets/baileys";
import { prisma } from "../../lib/prisma";
import { Prisma } from "@prisma/client";
import { dispatchQueueOrderBy, DEFAULT_DISPATCH_DELAY } from "../../lib/dispatchSettings";
import { session } from "../libs/makeWASocket";
import { phoneMaintenance } from "../libs/phoneMaintenance";
import { loadDispatchImage } from "./media";
import { loadAssetContent } from "../campaigns/media";
import type { AnyMessageContent } from "@whiskeysockets/baileys";
import { payloadContent } from "../campaigns/content";
import { assetPath } from "../campaigns/media";
import fs from "node:fs/promises";
import { dispatchDeadline, getDispatchAgeCutoff, getDispatchQueueOrder, getDispatchDelayRange } from "./settings";
import { randomDispatchDelay } from "./timing";
import { ACK_TIMEOUT_MS, acknowledgementFailure, retryEligible } from "./retry";
import { recordDispatchReceipt } from "./receipts";
import { waitForDispatchAcknowledgement, AckObservation } from "./acknowledgement";
import { recoverQuotaDispatches } from "./quotaRecovery";
import { selectDispatchSender } from "./senderRouting";

const runnable = () => ({ OR: [{ campaignId: null }, { campaign: { status: { in: ["WAITING", "PROCESSING"] as ("WAITING" | "PROCESSING")[] }, scheduledAt: { lte: new Date() } } }] });
// A future campaign must not expire merely because its queue rows were created early.
const ageEligible = (cutoff: Date) => ({ OR: [{ createdAt: { gt: cutoff } }, { campaign: { scheduledAt: { gt: cutoff } } }] });

const concurrency = Math.min(32, Math.max(1, Number(process.env.DISPATCH_CONCURRENCY) || 4));
const leaseMs = 120_000;
const progress = { running: false, startedAt: 0, worker_last_poll_success: 0,
  worker_last_claim: 0, worker_last_server_ack: 0, queueSampleAt: 0, recovery_last_success: 0 };
type QueueSample = { phoneId: string; jobs: bigint | number; oldest: Date; nextDue: Date };
let queueSample: QueueSample[] = [];
const claims = new Map<string, number>();
const eligibleSince = new Map<string, number>();

export function getDispatchHealth(now = Date.now()) {
  const sockets = Array.from(session, ([phoneId, socket]) => ({ phoneId, connected: socket.ws.isOpen && !!socket.user ? 1 : 0 }));
  const connected = new Set(sockets.filter(s => s.connected).map(s => s.phoneId));
  const alerts: string[] = [];
  if (!progress.running) alerts.push("WORKER_NOT_RUNNING");
  if (now - (progress.worker_last_poll_success || progress.startedAt) > 60_000) alerts.push("POLL_STALE");
  if (progress.running && now - (progress.queueSampleAt || progress.startedAt) > 60_000) alerts.push("QUEUE_SAMPLE_STALE");
  const senders = queueSample.map(row => {
    const jobs = Number(row.jobs), online = connected.has(row.phoneId);
    const due = online && row.nextDue.getTime() <= now;
    if (!due) eligibleSince.delete(row.phoneId);
    else if (!eligibleSince.has(row.phoneId)) eligibleSince.set(row.phoneId, now);
    const oldestAgeSeconds = Math.max(0, (now - row.oldest.getTime()) / 1000);
    if (oldestAgeSeconds > 300) alerts.push("BACKLOG_AGE_EXCEEDED");
    if (!online) alerts.push("SENDER_OFFLINE_WITH_BACKLOG");
    if (due && now - Math.max(eligibleSince.get(row.phoneId) || now, claims.get(row.phoneId) || 0) > 120_000) alerts.push("CLAIM_STALLED");
    return { phoneId: row.phoneId, jobs, connected: online ? 1 : 0, oldest_age_seconds: oldestAgeSeconds,
      last_claim: claims.get(row.phoneId) || null };
  });
  const reasons = Array.from(new Set(alerts)).sort();
  return { healthy: reasons.length === 0, at: new Date(now).toISOString(), alerts: reasons,
    metrics: { ...progress, worker_last_poll_success: progress.worker_last_poll_success || null,
      worker_last_claim: progress.worker_last_claim || null, worker_last_server_ack: progress.worker_last_server_ack || null,
      connected_socket_count: connected.size, queued_unexpired_jobs: senders.reduce((sum, sender) => sum + sender.jobs, 0) },
    sockets, pending_senders: senders };
}

// Error messages/Prisma queries can contain customer payloads. Keep codes and
// stack locations for diagnosis without serializing messages or query params.
function logFailure(event: string, error: unknown, startedAt: number, phoneId?: string, jobId?: string) {
  const e = error as { name?: string; code?: string; meta?: { code?: string }; stack?: string };
  console.error(event, JSON.stringify({ at: new Date().toISOString(), durationMs: Date.now() - startedAt,
    phoneId, jobId, name: e?.name, code: e?.code, databaseCode: e?.meta?.code,
    stack: e?.stack?.split("\n").filter(line => /^\s+at /.test(line)).slice(0, 12) }));
}

export async function recoverDispatches() {
  const cutoff = await getDispatchAgeCutoff();
  // A crash after transport starts is ambiguous. Never automatically resend it.
  await updateDispatches({ where: { status: "PROCESSING", leaseUntil: { lt: new Date() } },
    data: { status: "UNCERTAIN", lastError: "WORKER_INTERRUPTED_CHECK_RECIPIENT", leaseToken: null } });
  await updateDispatches({ where: { status: "QUEUED", createdAt: { lte: cutoff }, OR: [{ campaignId: null }, { campaign: { scheduledAt: { lte: cutoff } } }] },
    data: { status: "FAILED", lastError: "QUEUE_MAX_AGE_EXCEEDED" } });
  await updateDispatches({ where: { status: "QUEUED", expiresAt: { lte: new Date() }, campaignId: { not: null }, ...runnable() }, data: { status: "FAILED", lastError: "CAMPAIGN_EXPIRED" } });
  await prisma.campaign.updateMany({ where: { status: { in: ["WAITING", "PROCESSING"] }, dispatches: { none: { status: { in: ["QUEUED", "PROCESSING"] } } } }, data: { status: "COMPLETED" } });
  await recoverQuotaDispatches();
}

export async function processPhone(phoneId: string) {
  if (phoneMaintenance.has(phoneId)) return;
  const startedAt = Date.now();
  const token = randomUUID(); const now = new Date();
  const acquired = await prisma.waSenderLease.updateMany({ where: { phoneId, nextSendAt: { lte: now },
    OR: [{ leaseUntil: null }, { leaseUntil: { lt: now } }] }, data: { leaseToken: token, leaseUntil: new Date(Date.now() + leaseMs) } });
  if (!acquired.count) return;
  let jobId: string | undefined;
  let sendGap: number | undefined;
  let sendRange = DEFAULT_DISPATCH_DELAY;
  let heartbeatBusy = false;
  let senderId = phoneId;
  let grouped = false;
  let alternateLease = false;
  let attemptId: string | undefined;
  let attemptResult: { status: string; error: string | null } | undefined;
  const heartbeat = setInterval(async () => {
    if (heartbeatBusy) return; heartbeatBusy = true;
    try {
      const until = new Date(Date.now() + leaseMs);
      await prisma.waSenderLease.updateMany({ where: { phoneId, leaseToken: token }, data: { leaseUntil: until } });
      if (alternateLease) await prisma.waSenderLease.updateMany({ where: { phoneId: senderId, leaseToken: token }, data: { leaseUntil: until } });
      if (jobId) await updateDispatches({ where: { id: jobId, leaseToken: token, status: "PROCESSING" }, data: { leaseUntil: until } });
    } catch (error) { logFailure("DISPATCH_HEARTBEAT_FAILED", error, startedAt, phoneId, jobId); } finally { heartbeatBusy = false; }
  }, 15_000);
  try {
    const origin = await prisma.phone.findUnique({ where: { id: phoneId } });
    if (!origin) { await updateDispatches({ where: { phoneId, status: "QUEUED" }, data: { status: "FAILED", lastError: "SENDER_DELETED" } }); return; }
    const [cutoff, order, range] = await Promise.all([getDispatchAgeCutoff(), getDispatchQueueOrder(), getDispatchDelayRange()]);
    sendRange = range;
    const job = await prisma.waDispatch.findFirst({ where: { phoneId, status: "QUEUED", sentAt: null, deliveredAt: null, readAt: null, nextAttemptAt: { lte: new Date() }, AND: [ageEligible(cutoff), retryEligible(), dispatchDeadline(), runnable()] }, include: { campaign: true, media: true }, orderBy: dispatchQueueOrderBy(order) });
    if (!job) return;
    const selection = await selectDispatchSender(origin, job, token, leaseMs);
    grouped = selection.grouped;
    const { phone, socket } = selection;
    if (!phone || !socket || !socket.user) {
      const offlineError = selection.outsideHours ? "OUTSIDE_OPERATING_HOURS" : grouped ? "SENDER_GROUP_UNAVAILABLE" : origin.active !== 1 ? "DEVICE_INACTIVE" : "DEVICE_OFFLINE";
      // Defer this job without blocking newer, unsent jobs that can use a backup.
      sendGap = grouped ? 1000 : 30_000;
      await updateDispatches({ where: { id: job.id, status: "QUEUED" }, data: {
        lastError: job.messageId && !selection.outsideHours ? job.lastError : offlineError, nextAttemptAt: new Date(Date.now() + 30_000),
      } });
      return;
    }
    senderId = phone.id;
    alternateLease = selection.leased;
    if (await recipientBlocked(job.userId, job.recipient)) {
      await updateDispatches({ where: { id: job.id, status: "QUEUED" }, data: { status: "SUPPRESSED", lastError: "RECIPIENT_OPTED_OUT" } });
      return;
    }
    let image: Buffer | undefined;
    let content: AnyMessageContent | undefined;
    try {
      const payload = job.payload as { kind?: string } | null;
      if (payload?.kind === "sticker") {
        if (!job.media || job.media.userId !== job.userId || job.media.mime !== "image/webp") throw new Error("INVALID_STICKER");
        content = { sticker: await fs.readFile(assetPath(job.media.filename)) };
      } else if (payload) content = payloadContent(payload);
      else if (job.media) content = await loadAssetContent(job.media, job.userId, job.message);
      else if (job.image) image = await loadDispatchImage(job.image);
    }
    catch (error) {
      logFailure("DISPATCH_MEDIA_FAILED", error, startedAt, phoneId, job.id);
      const attempts = job.attempts + 1;
      await updateDispatches({ where: { id: job.id, status: "QUEUED" }, data: { attempts,
        status: attempts >= 5 ? "FAILED" : "QUEUED", lastError: "MEDIA_PREPARATION_FAILED",
        nextAttemptAt: new Date(Date.now() + Math.min(900_000, 30_000 * 2 ** attempts)) } }); return;
    }
    if (phoneMaintenance.has(senderId) || !socket.ws.isOpen) return;
    const claimCutoff = await getDispatchAgeCutoff();
    const messageId = job.messageId || generateMessageIDV2(socket.user.id);
    const claimed = await prisma.$transaction(async tx => {
      if (grouped && !job.messageId) {
        await tx.$queryRaw`SELECT id FROM sender_groups WHERE id = ${selection.groupId} FOR UPDATE`;
        const group = await tx.senderGroup.findFirst({ where: { id: selection.groupId!, userId: job.userId, enabled: true } });
        const members = await tx.phone.count({ where: { id: { in: Array.from(new Set([phoneId, senderId])) }, userId: job.userId, senderGroupId: selection.groupId } });
        if (!group || members !== new Set([phoneId, senderId]).size) return false;
      }
      if (job.campaignId) {
        await tx.$queryRaw`SELECT id FROM campaigns WHERE id = ${job.campaignId} FOR UPDATE`;
        const campaign = await tx.campaign.findUnique({ where: { id: job.campaignId } });
        if (!campaign || !["WAITING", "PROCESSING"].includes(campaign.status) || campaign.scheduledAt > new Date()) return false;
        await tx.campaign.update({ where: { id: campaign.id }, data: { status: "PROCESSING" } });
        sendGap = (campaign.delayMin + Math.floor(Math.random() * (campaign.delayMax - campaign.delayMin + 1))) * 1000;
      }
      const held = await tx.waSenderLease.findFirst({ where: { phoneId, leaseToken: token, leaseUntil: { gt: new Date() } } });
      if (!held) return false;
      if (alternateLease && !await tx.waSenderLease.findFirst({ where: { phoneId: senderId, leaseToken: token, leaseUntil: { gt: new Date() } } })) return false;
      const claim = await updateDispatches({ where: { id: job.id, status: "QUEUED", sentAt: null, deliveredAt: null, readAt: null, AND: [ageEligible(claimCutoff), retryEligible(), dispatchDeadline()] },
        data: { status: "PROCESSING", attempts: { increment: 1 }, messageId, leaseToken: token,
          senderPhoneId: senderId, senderGroupId: selection.groupId,
          leaseUntil: new Date(Date.now() + leaseMs), lastError: null } }, tx);
      if (claim.count === 1) {
        const attempt = await tx.waDispatchAttempt.create({ data: { dispatchId: job.id, phoneId: senderId, messageId } });
        attemptId = attempt.id;
      }
      return claim.count === 1;
    });
    if (!claimed) return;
    progress.worker_last_claim = Date.now();
    claims.set(phoneId, progress.worker_last_claim);
    jobId = job.id;
    let timeout: NodeJS.Timeout | undefined;
    let ackObservation: AckObservation = { tag: null, code: null };
    try {
      const sendAndConfirm = async () => {
        // sendMessage resolves after writing to the socket. Register first so a fast ACK is not missed.
        const acknowledgement = waitForDispatchAcknowledgement(
          (id, ms) => socket.waitForMessage(id, ms), messageId,
          observation => { ackObservation = observation; },
        );
        void acknowledgement.catch(() => {});
        if (phone.showTyping) await socket.sendPresenceUpdate("composing", `${job.recipient}@s.whatsapp.net`);
        // A late receipt may have cancelled this retry after the claim/typing.
        const current = await prisma.waDispatch.findUnique({ where: { id: job.id }, select: { status: true } });
        if (current?.status !== "PROCESSING") return null;
        const result = await socket.sendMessage(`${job.recipient}@s.whatsapp.net`, content || (image ? { image, caption: job.message } : { text: job.message }), { messageId });
        if (!result?.key?.id) throw new Error("NO_MESSAGE_ID");
        const ack = await acknowledgement;
        if (ack.attrs?.error === "463") throw new Error("WA_ACK_463");
        // Also accept an ACK that arrives after the outer timeout queued a retry.
        await recordDispatchReceipt(senderId, messageId, 2);
        return result;
      };
      const result = await Promise.race([
        sendAndConfirm(),
        new Promise<never>((_, reject) => { timeout = setTimeout(() => reject(new Error("SEND_TIMEOUT")), ACK_TIMEOUT_MS); }),
      ]);
      if (result === null) return;
      if (!result?.key?.id) throw new Error("NO_MESSAGE_ACK");
      progress.worker_last_server_ack = Date.now();
      await updateDispatches({ where: { id: job.id, status: "PROCESSING", leaseToken: token },
        data: { status: "SENT", sentAt: new Date(), leaseToken: null, leaseUntil: null, lastError: null } });
    } catch (error) {
      if (error instanceof SendGuardError) {
        attemptResult = { status: "SKIPPED", error: error.code };
        await updateDispatches({ where: { id: job.id, status: "PROCESSING", leaseToken: token }, data: {
          status: error.code === "RECIPIENT_OPTED_OUT" ? "SUPPRESSED" : "QUEUED",
          lastError: error.code,
          messageId: job.messageId, attempts: job.attempts,
          senderPhoneId: job.senderPhoneId,
          nextAttemptAt: error.code === "OUTSIDE_OPERATING_HOURS" ? new Date(Date.now() + 30000) : grouped && !job.messageId ? new Date(Date.now() + 1000) : error.retryAt || new Date(Date.now() + 60000), leaseToken: null, leaseUntil: null,
        } });
        sendGap = error.code === "OUTSIDE_OPERATING_HOURS" ? grouped ? 1000 : 30000 : grouped && !job.messageId ? 1000 : Math.max(1000, (error.retryAt?.getTime() || Date.now() + 60000) - Date.now());
        return;
      }
      if (error instanceof Error && ["SEND_TIMEOUT", "ACK_TIMEOUT", "WA_ACK_463"].includes(error.message)) {
        await prisma.deviceDailyUsage.updateMany({ where: { phoneId: senderId, day: usageDay(new Date(startedAt)) }, data: { failures: { increment: 1 } } });
      }
      if (error instanceof Error && error.message === "WA_ACK_463") {
        await prisma.deviceSendPolicy.updateMany({ where: { phoneId: senderId }, data: { paused: true, pauseReason: "WhatsApp menolak pengiriman dengan kode 463. Tinjau kondisi nomor sebelum melanjutkan." } });
        if (grouped) {
          // An explicit rejection is definitive, unlike a missing ACK. Keep the
          // dispatch identity, retire this message ID and choose a new sender.
          attemptResult = { status: "FAILED", error: "WA_ACK_463_ACCOUNT_RESTRICTED" };
          await updateDispatches({ where: { id: job.id, status: "PROCESSING", leaseToken: token }, data: {
            status: "QUEUED", messageId: null, senderPhoneId: null, lastError: "SENDER_REJECTED_RETRY",
            nextAttemptAt: new Date(Date.now() + 1000), leaseToken: null, leaseUntil: null,
          } });
          sendGap = 1000;
          return;
        }
      }
      logFailure("DISPATCH_ACK_FAILED", error, startedAt, phoneId, job.id);
      console.error("DISPATCH_ACK_DIAGNOSTIC", JSON.stringify({ at: new Date().toISOString(),
        phoneId, jobId: job.id, tag: ackObservation.tag, code: ackObservation.code,
        reason: error instanceof Error && ["SEND_TIMEOUT", "ACK_TIMEOUT", "WA_ACK_463", "NO_MESSAGE_ID"].includes(error.message) ? error.message : "TRANSPORT_ERROR" }));
      // Unknown/temporary ACK responses get the same deadline/backoff as silence.
      await updateDispatches({ where: { id: job.id, status: "PROCESSING", leaseToken: token },
        data: { ...acknowledgementFailure(error, job.attempts + 1), leaseToken: null, leaseUntil: null } });
    } finally { if (timeout) clearTimeout(timeout); }
  } catch (error) {
    logFailure("DISPATCH_JOB_FAILED", error, startedAt, phoneId, jobId);
    throw error;
  } finally {
    clearInterval(heartbeat);
    if (attemptId && jobId) {
      // Finish history without delaying lease release when the DB is unavailable.
      try {
        const final = await prisma.waDispatch.findUnique({ where: { id: jobId } });
        if (final) await prisma.waDispatchAttempt.updateMany({ where: { id: attemptId, status: "PROCESSING" },
          data: { ...(attemptResult || { status: final.status, error: final.lastError }), finishedAt: new Date() } });
      } catch (error) { logFailure("DISPATCH_ATTEMPT_HISTORY_FAILED", error, startedAt, senderId, jobId); }
    }
    // The shared transport sampled the global interval once. Reuse its cooldown
    // instead of drawing and applying another global delay after the ACK.
    const policy = await prisma.deviceSendPolicy.findUnique({ where: { phoneId: senderId }, select: { nextAllowedAt: true } });
    const nextSendAt = new Date(Math.max(policy?.nextAllowedAt.getTime() || 0,
      Date.now() + (sendGap ?? (jobId ? 0 : randomDispatchDelay(sendRange)))));
    await prisma.waSenderLease.updateMany({ where: { phoneId, leaseToken: token },
      data: { leaseToken: null, leaseUntil: null, nextSendAt: grouped ? new Date(Date.now() + (sendGap ?? 0)) : nextSendAt } });
    if (alternateLease) await prisma.waSenderLease.updateMany({ where: { phoneId: senderId, leaseToken: token },
      data: { leaseToken: null, leaseUntil: null, nextSendAt } });
  }
}

export function startDispatchWorker() {
  progress.running = true;
  progress.startedAt = Date.now();
  let stopping = false, polling = false;
  let timer: NodeJS.Timeout | undefined;
  let pollRange = DEFAULT_DISPATCH_DELAY;
  const schedulePoll = () => {
    if (!stopping) timer = setTimeout(() => { void tick(); }, randomDispatchDelay(pollRange));
  };
  let recovery: Promise<void> | undefined;
  const active = new Map<string, Promise<void>>();
  const recover = () => {
    if (stopping || recovery) return;
    const startedAt = Date.now();
    recovery = recoverDispatches().then(() => { progress.recovery_last_success = Date.now(); })
      .catch(error => logFailure("DISPATCH_RECOVERY_FAILED", error, startedAt))
      .finally(() => { recovery = undefined; });
  };
  const tick = async () => {
    if (stopping || polling) return; polling = true;
    const startedAt = Date.now();
    try {
      const [cutoff, order, range] = await Promise.all([getDispatchAgeCutoff(), getDispatchQueueOrder(), getDispatchDelayRange()]);
      pollRange = range;
      const senderOrder = order === "newest" ? Prisma.sql`MAX(d.createdAt) DESC` : Prisma.sql`MIN(d.createdAt) ASC`;
      // Group/limit in MySQL rather than loading every pending row for client-side distinct.
      const candidates = await prisma.$queryRaw<Array<{ phoneId: string }>>`
        SELECT d.phoneId FROM wa_dispatches d
        JOIN wa_sender_leases l ON l.phoneId = d.phoneId
        LEFT JOIN campaigns c ON c.id = d.campaignId
        WHERE d.status = 'QUEUED' AND (d.messageId IS NULL OR d.lastError IN ('ACK_TIMEOUT_RETRY', 'MEDIA_PREPARATION_FAILED', 'DEVICE_DAILY_LIMIT', 'DEVICE_THROTTLED', 'DEVICE_SAFETY_PAUSED', 'OUTSIDE_OPERATING_HOURS')) AND d.sentAt IS NULL
        AND d.deliveredAt IS NULL AND d.readAt IS NULL AND (d.createdAt > ${cutoff} OR c.scheduledAt > ${cutoff})
        AND (d.campaignId IS NULL OR d.expiresAt > ${new Date()})
        AND d.nextAttemptAt <= ${new Date()}
        AND l.nextSendAt <= ${new Date()} AND (l.leaseUntil IS NULL OR l.leaseUntil < ${new Date()})
        AND (d.campaignId IS NULL OR (c.status IN ('WAITING', 'PROCESSING') AND c.scheduledAt <= ${new Date()}))
        GROUP BY d.phoneId ORDER BY ${senderOrder}, d.phoneId ASC LIMIT 100`;
      progress.worker_last_poll_success = Date.now();
      for (const { phoneId } of candidates) {
        if (active.size >= concurrency || stopping) break;
        if (active.has(phoneId)) continue;
        const running = processPhone(phoneId).catch(() => {}).finally(() => active.delete(phoneId));
        active.set(phoneId, running);
      }
    } catch (error) { logFailure("DISPATCH_POLL_FAILED", error, startedAt); } finally { polling = false; schedulePoll(); }
  };
  const recoveryTimer = setInterval(recover, 30_000);
  let sampling: Promise<void> | undefined, previousAlerts = "";
  const sample = () => {
    if (stopping || sampling) return;
    const startedAt = Date.now();
    sampling = getDispatchAgeCutoff().then(cutoff => prisma.$queryRaw<QueueSample[]>`
      SELECT d.phoneId, COUNT(*) AS jobs, MIN(d.createdAt) AS oldest, MIN(d.nextAttemptAt) AS nextDue
      FROM wa_dispatches d LEFT JOIN campaigns c ON c.id = d.campaignId
      WHERE d.status = 'QUEUED' AND (d.messageId IS NULL OR d.lastError IN ('ACK_TIMEOUT_RETRY', 'MEDIA_PREPARATION_FAILED', 'DEVICE_DAILY_LIMIT', 'DEVICE_THROTTLED', 'DEVICE_SAFETY_PAUSED', 'OUTSIDE_OPERATING_HOURS')) AND d.sentAt IS NULL
      AND d.deliveredAt IS NULL AND d.readAt IS NULL AND (d.createdAt > ${cutoff} OR c.scheduledAt > ${cutoff})
      AND (d.campaignId IS NULL OR d.expiresAt > ${new Date()})
      AND (d.campaignId IS NULL OR (c.status IN ('WAITING', 'PROCESSING') AND c.scheduledAt <= ${new Date()}))
      GROUP BY d.phoneId`).then(rows => { queueSample = rows; progress.queueSampleAt = Date.now(); })
      .catch(error => logFailure("DISPATCH_HEALTH_SAMPLE_FAILED", error, startedAt))
      .finally(() => { sampling = undefined; });
  };
  const watchdog = () => {
    const health = getDispatchHealth();
    const key = health.alerts.join(",");
    if (key !== previousAlerts) {
      console[health.healthy ? "info" : "error"](health.healthy ? "DISPATCH_WATCHDOG_RECOVERED" : "DISPATCH_WATCHDOG_ALERT",
        JSON.stringify({ at: health.at, alerts: health.alerts, metrics: health.metrics }));
      previousAlerts = key;
    }
  };
  const sampleTimer = setInterval(sample, 15_000);
  const watchdogTimer = setInterval(watchdog, 10_000);
  recover();
  sample();
  const initialized = getDispatchDelayRange().then(range => { pollRange = range; }).catch(error => logFailure("DISPATCH_DELAY_SETTING_FAILED", error, progress.startedAt)).finally(schedulePoll);
  console.info("DISPATCH_WORKER_STARTED", JSON.stringify({ at: new Date().toISOString(), concurrency, delaySetting: "dispatch-random-delay" }));
  return async () => { stopping = true; progress.running = false; if (timer) clearTimeout(timer); clearInterval(recoveryTimer); clearInterval(sampleTimer); clearInterval(watchdogTimer); await initialized; while (polling) await new Promise(resolve => setTimeout(resolve, 50)); await Promise.allSettled([...Array.from(active.values()), ...(recovery ? [recovery] : []), ...(sampling ? [sampling] : [])]); };
}

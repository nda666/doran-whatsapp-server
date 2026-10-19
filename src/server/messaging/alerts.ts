import { randomUUID } from "node:crypto";
import { prisma } from "../../lib/prisma";
import { postmarkServerToken } from "../passwordReset";
import { decryptSetting } from "../../lib/globalSettings";
import { DEFAULT_EMAIL_FROM, EMAIL_FROM_KEY, emailFromInput } from "../../lib/emailSettings";

async function deliver(to: string, subject: string, body: string) {
  const [token, sender] = await Promise.all([postmarkServerToken(), prisma.globalSetting.findUnique({ where: { key: EMAIL_FROM_KEY } })]);
  const response = await fetch("https://api.postmarkapp.com/email", {
    method: "POST", signal: AbortSignal.timeout(15000),
    headers: { "Content-Type": "application/json", "X-Postmark-Server-Token": token },
    body: JSON.stringify({ From: emailFromInput.parse(sender ? decryptSetting(sender.value) : DEFAULT_EMAIL_FROM), To: to, Subject: subject, TextBody: body, MessageStream: "outbound" }),
  });
  const result = await response.json() as { ErrorCode?: number };
  if (!response.ok || result.ErrorCode !== 0) throw new Error("POSTMARK_DEVICE_ALERT_FAILED");
}

export async function processDeviceAlert(phoneId: string) {
  await prisma.deviceAlertState.upsert({ where: { phoneId }, create: { phoneId }, update: {} });
  const token = randomUUID();
  const acquired = await prisma.deviceAlertState.updateMany({ where: { phoneId, nextAttemptAt: { lte: new Date() }, OR: [{ leaseUntil: null }, { leaseUntil: { lt: new Date() } }] }, data: { leaseToken: token, leaseUntil: new Date(Date.now() + 60000) } });
  if (!acquired.count) return;
  try {
    const [phone, state] = await Promise.all([prisma.phone.findUnique({ where: { id: phoneId } }), prisma.deviceAlertState.findUniqueOrThrow({ where: { phoneId } })]);
    if (!phone) return;
    const preference = await prisma.messagingPreference.findUnique({ where: { userId: phone.userId } });
    if (!preference?.offlineAlertsEnabled || !preference.alertEmail) {
      await prisma.deviceAlertState.update({ where: { phoneId }, data: { offlineAt: null, notifiedAt: null, recoveryPending: false } });
      return;
    }
    if (!phone.isOnline) {
      if (state.recoveryPending) await prisma.deviceAlertState.update({ where: { phoneId }, data: { recoveryPending: false } });
      if (!state.offlineAt) {
        await prisma.deviceAlertState.update({ where: { phoneId }, data: { offlineAt: new Date(), recoveryPending: false } });
        return;
      }
      if (state.notifiedAt || Date.now() - state.offlineAt.getTime() < preference.offlineDelaySeconds * 1000 || (state.lastAlertAt && Date.now() - state.lastAlertAt.getTime() < 1800000)) return;
      await deliver(preference.alertEmail, `Doran WA: perangkat ${phone.name} terputus`, `Perangkat ${phone.name} (${phone.number || phone.id}) terputus sejak ${state.offlineAt.toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })} WIB. Periksa koneksi di dashboard Doran WA.`);
      await prisma.deviceAlertState.update({ where: { phoneId }, data: { notifiedAt: new Date(), lastAlertAt: new Date() } });
    } else if (state.offlineAt) {
      if (!state.recoveryPending) {
        await prisma.deviceAlertState.update({ where: { phoneId }, data: { recoveryPending: true, nextAttemptAt: new Date(Date.now() + 30000) } });
        return;
      }
      if (state.notifiedAt) await deliver(preference.alertEmail, `Doran WA: perangkat ${phone.name} tersambung kembali`, `Perangkat ${phone.name} (${phone.number || phone.id}) telah tersambung kembali. Antrean pengiriman dapat dilanjutkan sesuai batas pengiriman.`);
      await prisma.deviceAlertState.update({ where: { phoneId }, data: { offlineAt: null, notifiedAt: null, recoveryPending: false } });
    }
  } catch {
    console.error("DEVICE_ALERT_RETRY", phoneId);
    await prisma.deviceAlertState.updateMany({ where: { phoneId, leaseToken: token }, data: { nextAttemptAt: new Date(Date.now() + 300000) } });
  } finally {
    await prisma.deviceAlertState.updateMany({ where: { phoneId, leaseToken: token }, data: { leaseToken: null, leaseUntil: null } });
  }
}

export function startMessagingAlerts() {
  if (process.env.MESSAGING_ALERTS_ENABLED === "false") return async () => {};
  let stopping = false, active: Promise<void> | undefined;
  const tick = () => {
    if (stopping || active) return;
    active = (async () => {
      const owners = await prisma.messagingPreference.findMany({ where: { offlineAlertsEnabled: true }, select: { userId: true } });
      const phones = await prisma.phone.findMany({ where: { userId: { in: owners.map(o => o.userId) }, active: 1, number: { not: null } }, select: { id: true } });
      for (const phone of phones) { if (stopping) break; await processDeviceAlert(phone.id); }
    })().catch(() => console.error("DEVICE_ALERT_POLL_FAILED")).finally(() => { active = undefined; });
  };
  const timer = setInterval(tick, 15000);
  tick();
  return async () => { stopping = true; clearInterval(timer); await active; };
}

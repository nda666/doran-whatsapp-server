import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { prisma } from "../../lib/prisma";

const DAY_MS = 86400000;
const WIB_MS = 7 * 3600000;
const stateDirectory = join(process.cwd(), "storage", "daily-warmup");

export function evaluationWindow(now = new Date()) {
  const day = new Date(now.getTime() + WIB_MS).toISOString().slice(0, 10);
  const end = new Date(`${day}T00:00:00+07:00`);
  const middle = new Date(end.getTime() - DAY_MS);
  const start = new Date(middle.getTime() - DAY_MS);
  return { day, start, middle, end, next: new Date(end.getTime() + DAY_MS) };
}

/** Count successful sends by their actual send date, excluding queued/failed attempts. */
export async function evaluateDailyWarmup(now = new Date()) {
  const window = evaluationWindow(now);
  const dailyCounts = await Promise.all([
    { gte: window.start, lt: window.middle },
    { gte: window.middle, lt: window.end },
  ].map(sentAt => prisma.waDispatch.groupBy({
    by: ["phoneId"], where: { sentAt }, _count: { _all: true },
  })));
  const counts = dailyCounts.map(rows => new Map(rows.map(row => [row.phoneId, row._count._all])));
  const phones = await prisma.phone.findMany({ select: { id: true } });
  const results = [];
  for (const { id } of phones) {
    const sends = [counts[0].get(id) || 0, counts[1].get(id) || 0];
    // Serialize against connection updates/deletion, and recheck status at activation.
    const result = await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM phones WHERE id = ${id} FOR UPDATE`;
      const phone = await tx.phone.findUnique({ where: { id }, select: { isOnline: true } });
      if (!phone) return { phoneId: id, sends, outcome: "deleted" };
      const policy = await tx.deviceSendPolicy.findUnique({ where: { phoneId: id } });
      if (policy?.warmupStartedAt) return { phoneId: id, sends, online: phone.isOnline, outcome: "already_warming" };
      if (phone.isOnline || sends.some(count => count === 0)) {
        return { phoneId: id, sends, online: phone.isOnline, outcome: "ineligible" };
      }
      // Match manual activation: preserve quotas, pauses and an existing start date.
      await tx.deviceSendPolicy.upsert({ where: { phoneId: id }, create: { phoneId: id }, update: {} });
      const changed = await tx.deviceSendPolicy.updateMany({
        where: { phoneId: id, warmupStartedAt: null }, data: { warmupStartedAt: new Date() },
      });
      return { phoneId: id, sends, online: false, outcome: changed.count ? "started" : "already_warming" };
    });
    results.push(result);
  }
  return { day: window.day, days: [
    new Date(window.start.getTime() + WIB_MS).toISOString().slice(0, 10),
    new Date(window.middle.getTime() + WIB_MS).toISOString().slice(0, 10),
  ], checkedAt: new Date().toISOString(), results };
}

/** One scheduler in the existing single-instance PM2 server; storage survives CD. */
export function startDailyWarmup() {
  if (process.env.WHATSAPP_ENABLED === "false") return async () => {};
  let stopping = false;
  let timer: NodeJS.Timeout;
  let active: Promise<void> | undefined;
  const schedule = (delay: number) => {
    if (!stopping) { timer = setTimeout(tick, delay); timer.unref(); }
  };
  const tick = () => {
    if (stopping) return;
    active = (async () => {
      const now = new Date();
      const window = evaluationWindow(now);
      const reportPath = join(stateDirectory, "latest.json");
      let completedDay: string | undefined;
      try {
        completedDay = JSON.parse(await readFile(reportPath, "utf8")).day;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
      if (completedDay !== window.day) {
        const report = await evaluateDailyWarmup(now);
        await mkdir(stateDirectory, { recursive: true });
        const temporary = join(stateDirectory, "latest.tmp");
        await writeFile(temporary, JSON.stringify(report, null, 2), { mode: 0o600 });
        await rename(temporary, reportPath);
        console.info("DAILY_WARMUP_COMPLETED", report.day, "checked", report.results.length,
          "started", report.results.filter(result => result.outcome === "started").length);
      }
      schedule(Math.max(1, evaluationWindow().next.getTime() - Date.now()));
    })().catch(error => {
      console.error("DAILY_WARMUP_RETRY", error.message);
      schedule(60000);
    }).finally(() => { active = undefined; });
  };
  // Let WhatsApp recovery settle, then catch up once if midnight was missed.
  schedule(60000);
  return async () => { stopping = true; clearTimeout(timer); await active; };
}

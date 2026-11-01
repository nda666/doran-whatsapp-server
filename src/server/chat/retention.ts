import fs from "node:fs/promises";
import path from "node:path";
import { prisma } from "../../lib/prisma";
import { chatMediaDirectory } from "./media";
import { mediaDirectory } from "../campaigns/media";

const DAY_MS = 86_400_000;
const BATCH_SIZE = 250;
const shared = globalThis as typeof globalThis & { doranMediaMaintenance?: Promise<unknown> };

export function retentionDays(value: string | undefined) {
  // Missing/invalid settings preserve content. A nonzero value must be at least 30 days.
  if (!value || !/^\d+$/.test(value)) return 0;
  const days = Number(value);
  return Number.isSafeInteger(days) && days >= 30 && days <= 3650 ? days : 0;
}

/** Only filenames owned by this application, never recurse or follow symlinks.
 * A 24-hour grace protects uploads captured before their DB transaction commits.
 */
async function pruneOrphans(directory: string, valid: RegExp, referenced: (filename: string) => Promise<boolean>, now: number) {
  let removed = 0;
  try {
    const directoryStat = await fs.lstat(directory);
    if (!directoryStat.isDirectory() || directoryStat.isSymbolicLink()) throw new Error("UNSAFE_MEDIA_DIRECTORY");
    const entries = await fs.opendir(directory);
    for await (const entry of entries) {
      if (!entry.isFile() || !valid.test(entry.name)) continue;
      const file = path.join(directory, entry.name);
      const stat = await fs.lstat(file);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.mtimeMs > now - DAY_MS || stat.birthtimeMs > now - DAY_MS) continue;
      if (await referenced(entry.name)) continue;
      await fs.unlink(file);
      if (++removed >= BATCH_SIZE) break;
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  return removed;
}

/** Bounded content expiry preserves message IDs/request hashes, so retries cannot resend old chat.
 * Asset-library files remain protected as long as their MediaAsset row exists.
 */
export async function runMediaMaintenance(now = new Date()) {
  const mediaDays = retentionDays(process.env.CHAT_MEDIA_RETENTION_DAYS);
  const contentDays = retentionDays(process.env.CHAT_CONTENT_RETENTION_DAYS);
  let mediaExpired = 0, contentExpired = 0;
  if (mediaDays) {
    const where = { createdAt: { lt: new Date(now.getTime() - mediaDays * DAY_MS) }, mediaPath: { not: null }, status: { notIn: ["SENDING", "UNCERTAIN"] } };
    const rows = await prisma.chatMessage.findMany({ where, orderBy: [{ createdAt: "asc" }, { id: "asc" }], take: BATCH_SIZE, select: { id: true } });
    if (rows.length) mediaExpired = (await prisma.chatMessage.updateMany({ where: { ...where, id: { in: rows.map(row => row.id) } },
      data: { mediaPath: null, mediaMime: null, mediaName: null } })).count;
    // Files are removed by the orphan sweep, so a crash here leaves a recoverable orphan.
  }
  if (contentDays) {
    const where = { createdAt: { lt: new Date(now.getTime() - contentDays * DAY_MS) }, status: { notIn: ["SENDING", "UNCERTAIN"] },
      OR: [{ text: { not: "" } }, { quotedText: { not: null } }] };
    const rows = await prisma.chatMessage.findMany({ where, orderBy: [{ createdAt: "asc" }, { id: "asc" }], take: BATCH_SIZE, select: { id: true, conversationId: true } });
    if (rows.length) await prisma.$transaction(async tx => {
      contentExpired = (await tx.chatMessage.updateMany({ where: { ...where, id: { in: rows.map(row => row.id) } }, data: { text: "", quotedText: null } })).count;
      // A conversation preview must not keep a second copy of expired text.
      await tx.chatConversation.updateMany({ where: { id: { in: rows.map(row => row.conversationId) },
        lastMessageAt: { lt: new Date(now.getTime() - contentDays * DAY_MS) } }, data: { lastMessage: null } });
    });
  }
  const chatOrphansRemoved = await pruneOrphans(chatMediaDirectory(), /^[a-f\d-]{36}\.bin$/i,
    async mediaPath => !!await prisma.chatMessage.findFirst({ where: { mediaPath }, select: { id: true } }), now.getTime());
  const assetOrphansRemoved = await pruneOrphans(mediaDirectory(), /^[a-f\d-]{36}\.[a-z0-9]+$/i,
    async filename => !!await prisma.mediaAsset.findFirst({ where: { filename }, select: { id: true } }), now.getTime());
  return { mediaExpired, contentExpired, chatOrphansRemoved, assetOrphansRemoved };
}

export function startMediaMaintenance() {
  let stopping = false;
  const run = () => {
    if (stopping || shared.doranMediaMaintenance) return;
    shared.doranMediaMaintenance = runMediaMaintenance()
      .then(report => { if (Object.values(report).some(Boolean)) console.info("MEDIA_MAINTENANCE", report); })
      .catch(() => console.error("MEDIA_MAINTENANCE_FAILED"))
      .finally(() => { shared.doranMediaMaintenance = undefined; });
  };
  const startup = setTimeout(run, 120_000);
  const timer = setInterval(run, 3_600_000);
  startup.unref(); timer.unref();
  return async () => { stopping = true; clearTimeout(startup); clearInterval(timer); await shared.doranMediaMaintenance; };
}

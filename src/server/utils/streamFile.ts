import fs from "node:fs/promises";
import type { ServerResponse } from "node:http";
import { pipeline } from "node:stream/promises";

/** One byte range, including suffix and open-ended ranges. Invalid/multiple ranges get 416. */
export function fileRange(header: string, size: number): { start: number; end: number } | null {
  const match = /^bytes=(\d*)-(\d*)$/.exec(header);
  if (!match || (!match[1] && !match[2]) || size === 0) return null;
  const first = Number(match[1]), last = Number(match[2]);
  if (!Number.isSafeInteger(first) || !Number.isSafeInteger(last)) return null;
  const start = match[1] ? first : Math.max(0, size - last);
  const end = match[1] && match[2] ? Math.min(last, size - 1) : size - 1;
  return start <= end && start < size ? { start, end } : null;
}

/** Stream from the same opened descriptor we stat; pipeline releases it on client disconnect. */
export async function streamFile(filename: string, res: ServerResponse, range?: string, head = false) {
  let file: Awaited<ReturnType<typeof fs.open>>;
  try { file = await fs.open(filename, "r"); }
  catch (error) {
    if (["ENOENT", "ENOTDIR"].includes((error as NodeJS.ErrnoException).code || "")) { res.statusCode = 404; res.end(); return; }
    throw error;
  }
  try {
    const stat = await file.stat();
    if (!stat.isFile()) { res.statusCode = 404; res.end(); return; }
    res.setHeader("Accept-Ranges", "bytes");
    const selected = range && !head ? fileRange(range, stat.size) : undefined;
    if (selected === null) {
      res.statusCode = 416;
      res.setHeader("Content-Range", `bytes */${stat.size}`);
      res.setHeader("Content-Length", 0);
      res.end(); return;
    }
    if (selected) {
      res.statusCode = 206;
      res.setHeader("Content-Range", `bytes ${selected.start}-${selected.end}/${stat.size}`);
    }
    res.setHeader("Content-Length", selected ? selected.end - selected.start + 1 : stat.size);
    if (head || stat.size === 0) { res.end(); return; }
    await pipeline(file.createReadStream(selected || {}), res);
  } catch (error) {
    // pipeline already destroys both streams on errors, including an aborted download.
    if (!res.destroyed) res.destroy(error instanceof Error ? error : undefined);
  } finally { await file.close().catch(() => {}); }
}

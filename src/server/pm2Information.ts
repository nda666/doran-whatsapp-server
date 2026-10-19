import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

// PM2 environments contain secrets; only these selected fields may leave the server.
export function summarizePm2(row: any, savedRows: any[]) {
  const e = row.pm2_env, saved = savedRows.find(item => item.name === row.name);
  const keys = ["max_memory_restart", "exp_backoff_restart_delay", "kill_timeout", "log_date_format", "exec_mode", "watch", "autorestart"];
  const savedMatches = saved ? keys.every(key => saved[key] === e[key]) && JSON.stringify(saved.node_args) === JSON.stringify(e.node_args) : null;
  const heap = (e.node_args || []).find((arg: string) => arg.startsWith("--max-old-space-size="));
  return { name: row.name, id: row.pm_id, pid: row.pid, status: e.status,
    mode: e.exec_mode === "fork_mode" ? "fork" : e.exec_mode, instances: e.instances || 1,
    startedAt: e.pm_uptime ? new Date(e.pm_uptime).toISOString() : null,
    memoryMiB: Math.round((row.monit?.memory || 0) / 1024 / 1024), cpu: row.monit?.cpu ?? null,
    restarts: e.restart_time ?? 0, unstableRestarts: e.unstable_restarts ?? 0,
    memoryRestartMiB: e.max_memory_restart ? e.max_memory_restart / 1024 / 1024 : null,
    heapMiB: heap ? Number(heap.split("=")[1]) : null,
    backoffMs: e.exp_backoff_restart_delay ?? null, killTimeoutMs: e.kill_timeout ?? null,
    autoRestart: !!e.autorestart, watch: !!e.watch, logDateFormat: e.log_date_format || null, savedMatches };
}
let snapshot: { at: number; data: object } | undefined;
let pending: Promise<object> | undefined;
export async function readPm2Information(): Promise<any> {
  if (snapshot && Date.now() - snapshot.at < 10_000) return snapshot.data;
  if (pending) return pending;
  pending = (async () => {
    if (!process.env.PM2_HOME || process.env.pm_id === undefined) return { available: false };
    try {
      const raw = await new Promise<string>((resolve, reject) => execFile("/usr/local/bin/pm2", ["jlist"],
        { timeout: 5000, maxBuffer: 4 * 1024 * 1024 }, (error, stdout) => error ? reject(error) : resolve(stdout)));
      const row = JSON.parse(raw).find((item: any) => item.pid === process.pid && item.name === "doran-whatsapp");
      if (!row) return { available: false };
      let saved: any[] = [];
      try { saved = JSON.parse(fs.readFileSync(path.join(process.env.PM2_HOME, "dump.pm2"), "utf8")); } catch { /* Do not return private errors. */ }
      let version: string | null = null;
      try { version = JSON.parse(fs.readFileSync("/usr/local/lib/node_modules/pm2/package.json", "utf8")).version; } catch { /* Global package location can differ. */ }
      const data = { available: true, checkedAt: new Date().toISOString(), version, ...summarizePm2(row, saved) };
      snapshot = { at: Date.now(), data };
      return data;
    } catch { return { available: false }; }
  })().finally(() => { pending = undefined; });
  return pending;
}

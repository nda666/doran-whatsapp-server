#!/usr/bin/env node
// Daily, fail-closed maintenance. --dry-run makes no filesystem/DB changes.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const app = path.resolve(__dirname, '..');
const home = '/home/jeblast';
const dry = process.argv.includes('--dry-run');
const day = 86400000;
const now = Date.now();
const report = { at: new Date(now).toISOString(), dryRun: dry, bytesRemoved: 0, actions: [], skipped: [] };
const opened = new Set();
function safe(p) {
  // Reject every symlink component, including parent directories.
  for (let q = path.resolve(p); q !== path.dirname(q); q = path.dirname(q)) {
    if (fs.existsSync(q) && fs.lstatSync(q).isSymbolicLink()) return false;
  }
  return true;
}
function inspect(p) {
  if (!safe(p) || !fs.existsSync(p)) return null;
  const s = fs.lstatSync(p);
  if (opened.has(p)) return null;
  if (s.isFile()) return { bytes: s.size, newest: s.mtimeMs };
  if (!s.isDirectory()) return null;
  let bytes = 0, newest = s.mtimeMs;
  for (const name of fs.readdirSync(p)) {
    const result = inspect(path.join(p, name));
    if (!result) return null;
    bytes += result.bytes;
    newest = Math.max(newest, result.newest);
  }
  return { bytes, newest };
}
function remove(p, category, ageDays) {
  const info = inspect(p);
  if (!info || info.newest > now - ageDays * day) return;
  if (!dry) fs.rmSync(p, { recursive: true, force: false });
  report.bytesRemoved += info.bytes;
  report.actions.push({ category, path: p, bytes: info.bytes });
}
function children(root) {
  return safe(root) && fs.existsSync(root) ? fs.readdirSync(root).map(n => path.join(root, n)) : [];
}
function logs(root, pm2 = false) {
  for (const p of children(root)) {
    const name = path.basename(p);
    if (!name.includes('.log') || (pm2 && !(name.startsWith('doran-whatsapp-') && name.includes('__')))) continue;
    // Current symlink targets and open files are always preserved.
    const targets = children(root).filter(q => fs.lstatSync(q).isSymbolicLink()).map(q => fs.realpathSync(q));
    if (!targets.includes(p)) remove(p, 'logs', 30);
  }
}
async function main() {
  if (app !== '/home/jeblast/repos/doran-whatsapp-server') throw new Error('Unexpected application directory');
  require('@next/env').loadEnvConfig(app, false, { info() {}, error() {} });
  let installBusy = false;
  for (const pid of fs.readdirSync('/proc').filter(n => /^\d+$/.test(n))) {
    const root = '/proc/' + pid;
    try {
      if (fs.statSync(root).uid !== process.getuid()) continue;
      const command = fs.readFileSync(root + '/cmdline', 'utf8').replace(/\0/g, ' ');
      if (/npm|next build|tsc|doran-maintenance-/.test(command) && Number(pid) !== process.pid && !command.includes('maintenance.cjs') && !command.includes('run-maintenance.sh')) installBusy = true;
      for (const fd of fs.readdirSync(root + '/fd')) {
        try { opened.add(fs.realpathSync(root + '/fd/' + fd)); } catch (e) { if (!['ENOENT', 'EINVAL'].includes(e.code)) throw e; }
      }
    } catch (e) {
      if (e.code === 'EACCES' || e.code === 'EPERM') report.skipped.push('Restricted /proc entry: ' + pid);
      else if (e.code !== 'ENOENT' && e.code !== 'ESRCH') throw e;
    }
  }
  logs(path.join(app, 'storage/logs'));
  logs(path.join(home, '.pm2/logs'), true);
  logs(path.join(home, '.local/state/doran-maintenance/reports'));
  if (!installBusy) {
    // npm cache is disposable; no command runs npm cache clean against another installation.
    remove(path.join(home, '.npm/_cacache'), 'npm_cache', 0);
    for (const p of children(path.join(home, '.npm/_logs'))) if (p.endsWith('.log')) remove(p, 'npm_logs', 7);
    remove(path.join(app, '.next/cache/webpack'), 'build_cache', 7);
    // Only explicit build archives, never arbitrary zip files containing sessions or uploads.
    for (const p of children(path.join(app, 'deployment/build-archives'))) if (/\.(tar\.gz|zip)$/.test(p)) remove(p, 'build_archive', 30);
    for (const name of ['b.zip', 'build.zip']) {
      const p = path.join(app, name);
      if (!safe(p) || !fs.existsSync(p)) continue;
      const check = cp.spawnSync('/usr/bin/python3', ['-c', 'import sys,zipfile; z=zipfile.ZipFile(sys.argv[1]); names=z.namelist(); sys.exit(0 if names and all(n.split("/")[0] in (".next","dist") and ".." not in n.split("/") for n in names) else 1)', p], { timeout: 30000 });
      if (check.status === 0) remove(p, 'build_archive', 30);
      else report.skipped.push('Unrecognized archive preserved: ' + name);
    }
    // Dedicated scratch directory; never scan/delete global /tmp or uploads/media.
    for (const p of children(path.join(app, 'storage/tmp'))) remove(p, 'temporary', 7);
  } else report.skipped.push('Cache/build/temp cleanup: installation or build in progress');
  // Retain at least the two newest known rollback backups, even when older than 30 days.
  const backups = children(path.join(home, 'backups')).filter(p => /^doran-(dashboard|update|maintenance|tooling|dispatch|phone-format)-\d{8}/.test(path.basename(p)) && safe(p) && fs.statSync(p).isDirectory());
  backups.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
  for (const p of backups.slice(2)) remove(p, 'rollback_archive', 30);

  const { PrismaClient } = require('@prisma/client');
  const prisma = new PrismaClient();
  try {
    const devices = await prisma.phone.findMany({ select: { id: true, userId: true } });
    const registered = new Set(devices.map(p => `${p.userId}-${p.id}`));
    report.registeredDevices = devices.length;
    const expired = { expires: { lt: new Date(now) } };
    report.expiredLoginSessions = dry ? await prisma.session.count({ where: expired }) : (await prisma.session.deleteMany({ where: expired })).count;
    report.expiredVerificationTokens = dry ? await prisma.verificationToken.count({ where: expired }) : (await prisma.verificationToken.deleteMany({ where: expired })).count;
    if (process.env.DISPATCH_QUEUE_ENABLED === 'true') {
      // Preserve dedupe metadata for 180 days; uncertain results stay for review.
      const terminal = ['SENT', 'DELIVERED', 'READ', 'FAILED'];
      const clearPayload = { message: { not: '' }, OR: [
        { status: { in: ['SENT', 'DELIVERED', 'READ'] }, createdAt: { lt: new Date(now - 7 * day) } },
        { status: { in: ['FAILED', 'UNCERTAIN'] }, createdAt: { lt: new Date(now - 30 * day) } },
      ] };
      report.dispatchPayloadsCleared = dry ? await prisma.waDispatch.count({ where: clearPayload }) :
        (await prisma.waDispatch.updateMany({ where: clearPayload, data: { message: '', image: null, payload: require('@prisma/client').Prisma.DbNull, mediaId: null } })).count;
      const oldDispatch = { status: { in: terminal }, createdAt: { lt: new Date(now - 180 * day) } };
      report.dispatchHistoryRemoved = dry ? await prisma.waDispatch.count({ where: oldDispatch }) :
        (await prisma.waDispatch.deleteMany({ where: oldDispatch })).count;
    }
    // Automatic WA cleanup runs only while connections are disabled, preventing a socket/auth race.
    if (process.env.WHATSAPP_ENABLED !== 'false') {
      report.skipped.push('WhatsApp sessions: connections enabled');
    } else {
      const quarantine = path.join(home, '.local/state/doran-maintenance/quarantine');
      if (!dry) fs.mkdirSync(quarantine, { recursive: true, mode: 0o700 });
      const sessionName = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}-[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
      const configured = path.resolve(app, process.env.WHATSAPP_AUTH_FOLDER || './storage/whatsapp-auth');
      if (configured !== path.join(app, 'storage/whatsapp-auth')) throw new Error('Unexpected auth folder; session cleanup stopped');
      const roots = [configured, path.join(app, 'whatsapp-auth'), path.join(home, 'repos/whatsapp-auth'), path.join(app, 'storage/whatsapp-auth-old')];
      for (const root of roots) for (const p of children(root)) {
        const name = path.basename(p);
        if (!sessionName.test(name) || registered.has(name)) continue;
        const info = inspect(p);
        if (!info || info.newest > now - 30 * day) continue;
        // Recheck the device immediately before moving/deleting any auth state.
        if (await prisma.phone.findUnique({ where: { id: name.slice(37) }, select: { id: true } })) continue;
        const target = path.join(quarantine, `${now}-${roots.indexOf(root)}-${name}`);
        if (!dry) {
          fs.renameSync(p, target);
          fs.utimesSync(target, new Date(now), new Date(now));
        }
        report.actions.push({ category: 'session_quarantine', path: p, target, bytes: info.bytes });
      }
      for (const p of children(quarantine)) {
        const match = path.basename(p).match(/^(\d+)-[0-3]-(.+)$/);
        if (!match || !sessionName.test(match[2]) || Number(match[1]) > now - 30 * day || registered.has(match[2])) continue;
        if (await prisma.phone.findUnique({ where: { id: match[2].slice(37) }, select: { id: true } })) continue;
        remove(p, 'orphan_session', 30);
      }
    }
  } catch (error) {
    report.error = 'Database/session cleanup stopped: ' + error.message;
    process.exitCode = 1;
  } finally { await prisma.$disconnect(); }
  const health = await fetch('http://127.0.0.1:3000/signin', { signal: AbortSignal.timeout(10000) }).then(r => r.status).catch(() => 0);
  report.dashboardStatus = health;
  if (health !== 200) process.exitCode = 1;
  if (!dry) {
    const reports = path.join(home, '.local/state/doran-maintenance/reports');
    fs.mkdirSync(reports, { recursive: true, mode: 0o700 });
    fs.writeFileSync(path.join(reports, new Date(now).toISOString().replace(/[:.]/g, '-') + '.log.json'), JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
  }
  console.log(JSON.stringify(report, null, 2));
}
if (require.main === module) main().catch(error => { console.error('Maintenance stopped:', error.message); process.exitCode = 1; });
module.exports = { safe, inspect, remove, report, opened };

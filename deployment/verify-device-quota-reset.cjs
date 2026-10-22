'use strict';
// Offline API validation and ownership regression; no database or WhatsApp access.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
function load(file, mocks) {
  const mod = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: 1, target: 7, esModuleInterop: true } }).outputText;
  new Function('require', 'module', 'exports', code)(key => {
    assert(key in mocks, `Unmocked dependency: ${key}`); return mocks[key];
  }, mod, mod.exports);
  return mod.exports;
}
const reset = load('src/lib/quotaReset.ts', { zod: require('zod') });
const phoneId = '12345678-1234-4234-8234-123456789abc';
const dbNull = { kind: 'DbNull' };
let owned = true, saved, writes = 0;
const db = {
  phone: { findFirst: async ({ where }) => { assert.equal(where.userId, 'owner'); return owned ? { id: phoneId } : null; } },
  deviceSendPolicy: { upsert: async ({ create, update }) => { assert.equal(create.phoneId, phoneId); saved = update; writes++; return update; } },
};
const handler = load('src/pages/api/device-policies.ts', {
  zod: require('zod'), '@prisma/client': { Prisma: { DbNull: dbNull } },
  '@/lib/quotaReset': reset, '@/server/dispatch/settings': {},
  '@/lib/operatingHours': { operatingHoursInput: require('zod').z.any() },
  '@/middleware/apiAuthMiddleware': { __esModule: true, default: fn => fn },
  '@/lib/prisma': { prisma: db }, '@/lib/access': { ownerScope: user => ({ userId: user.id }) },
  '@/server/messaging/safety': {}, '@/lib/deviceQuota': {},
}).default;
async function request(extra) {
  const res = { code: 200, setHeader() {}, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; }, end() { return this; } };
  await handler({ method: 'PUT', user: { id: 'owner' }, body: { phoneId, useGlobalQuota: true, dailyLimit: 200, adaptiveEnabled: true, paused: false, ...extra } }, res);
  return res;
}
(async () => {
  for (const quotaReset of [{ mode: 'midnight', hours: 24 }, { mode: 'after-full', hours: 6 }, { mode: 'after-full', hours: 168 }]) {
    assert.equal((await request({ quotaReset })).code, 200);
    assert.deepEqual(saved.quotaReset, quotaReset);
  }
  assert.equal((await request({ quotaReset: null })).code, 200);
  assert.equal(saved.quotaReset, dbNull, 'Explicit global choice clears the override');
  await request({}); assert(!('quotaReset' in saved), 'Older clients preserve existing override');
  const before = writes;
  for (const quotaReset of [{ mode: 'after-full', hours: 0 }, { mode: 'after-full', hours: 169 }, { mode: 'after-full', hours: 1.5 }, { mode: 'bad', hours: 24 }, { mode: 'after-full' }]) {
    assert.equal((await request({ quotaReset })).code, 400);
  }
  owned = false;
  assert.equal((await request({ quotaReset: { mode: 'after-full', hours: 6 } })).code, 404);
  assert.equal(writes, before, 'Invalid and foreign-device writes are rejected');
  const global = { mode: 'midnight', hours: 24 };
  assert.equal(reset.effectiveQuotaReset(global, null), global);
  assert.deepEqual(reset.effectiveQuotaReset(global, { mode: 'after-full', hours: 6 }), { mode: 'after-full', hours: 6 });
  const cases = [
    // WIB: full at 10:00 -> midnight; 16:59:59.999 -> midnight.
    ['2026-10-22T03:00:00Z', 7, '2026-10-22T17:00:00Z'],
    ['2026-10-22T09:59:59.999Z', 7, '2026-10-22T17:00:00Z'],
    // Exactly 17:00 WIB belongs to the configured-delay branch.
    ['2026-10-22T10:00:00Z', 3, '2026-10-22T13:00:00Z'],
    ['2026-10-22T10:00:00.001Z', 7, '2026-10-22T17:00:00.001Z'],
    ['2026-10-22T13:00:00Z', 7, '2026-10-22T20:00:00Z'],
    ['2026-10-22T16:59:59Z', 7, '2026-10-22T23:59:59Z'],
    ['2026-10-22T17:00:00Z', 7, '2026-10-23T17:00:00Z'],
    // The threshold stays seven hours when the configured delay changes.
    ['2026-10-22T03:00:00Z', 1, '2026-10-22T17:00:00Z'],
    ['2026-12-31T16:00:00Z', 7, '2026-12-31T23:00:00Z'],
  ];
  for (const [full, hours, expected] of cases) {
    const reachedAt = new Date(full), resetAt = new Date(expected);
    assert.equal(reset.fullQuotaResetAt(reachedAt, hours).toISOString(), resetAt.toISOString());
    const window = { attempts: 50, startedAt: reachedAt, lastAttemptAt: reachedAt, reachedAt };
    const setting = { mode: 'after-full', hours };
    const pending = reset.quotaWindowState(window, 0, 50, setting, new Date(resetAt.getTime() - 1));
    assert.equal(pending.used, 50, 'Full quota stays blocked until its deadline, including across midnight');
    assert.equal(pending.resetAt.toISOString(), resetAt.toISOString(), 'Deadline depends on full timestamp, never on current time');
    assert.equal(reset.quotaWindowState(window, 0, 50, setting, resetAt).used, 0);
  }
  console.log('DEVICE_QUOTA_RESET_OK: per-number override, global fallback, validation, omitted values and owner scope');
})().catch(error => { console.error(error); process.exitCode = 1; });

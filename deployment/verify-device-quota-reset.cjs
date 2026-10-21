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
  console.log('DEVICE_QUOTA_RESET_OK: per-number override, global fallback, validation, omitted values and owner scope');
})().catch(error => { console.error(error); process.exitCode = 1; });

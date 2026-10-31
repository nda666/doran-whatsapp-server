'use strict';
// Offline behavioral tests. No WhatsApp, network or production database access.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), os = require('node:os'), ts = require('typescript');
const root = path.resolve(__dirname, '..');
function load(file, dependencies, shared = {}) {
  const code = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', 'globalThis', code)(name => {
    if (Object.hasOwn(dependencies, name)) return dependencies[name];
    if (name.startsWith('node:')) return require(name);
    throw Error('Unexpected dependency ' + name);
  }, module, module.exports, shared);
  return module.exports;
}
function matches(row, where = {}) {
  return Object.entries(where).every(([key, value]) => {
    if (key === 'OR') return value.some(item => matches(row, item));
    if (key.includes('_') && !Object.hasOwn(row, key) && value && typeof value === 'object') return matches(row, value);
    if (value && typeof value === 'object' && !(value instanceof Date)) return Object.entries(value).every(([op, val]) => op === 'in' ? val.includes(row[key]) : op === 'gt' ? row[key] > val : op === 'lte' ? row[key] <= val : op === 'contains' ? row[key]?.includes(val) : row[key]?.[op] === val);
    return row[key] === value;
  });
}
function memoryDb() {
  const tables = {}; let serial = Promise.resolve();
  const db = { tables, $queryRaw: async () => [], $transaction: fn => {
    const next = serial.then(async () => { const before = structuredClone(tables); try { return await fn(db); } catch (error) { for (const key of Object.keys(tables)) tables[key] = before[key] || []; throw error; } });
    serial = next.catch(() => {}); return next;
  } };
  for (const name of ['waAuthSession', 'waAuthKey', 'waRestriction', 'waProtocolMessage', 'recipientConsent', 'recipientConsentEvent', 'recipientSuppression']) {
    tables[name] = [];
    db[name] = {
      findUnique: async ({ where }) => tables[name].find(row => matches(row, where)) || null,
      findUniqueOrThrow: async args => { const row = await db[name].findUnique(args); if (!row) throw Error('Missing row'); return row; },
      findMany: async ({ where = {} } = {}) => tables[name].filter(row => matches(row, where)),
      count: async ({ where }) => tables[name].filter(row => matches(row, where)).length,
      create: async ({ data }) => { const row = { leaseToken: null, migratedAt: null, active: false, revokedAt: null, createdAt: new Date(), ...data }; tables[name].push(row); return row; },
      createMany: async ({ data, skipDuplicates }) => { for (const row of data) { if (skipDuplicates && tables[name].some(old => old.phoneId === row.phoneId)) continue; await db[name].create({ data: row }); } return { count: data.length }; },
      updateMany: async ({ where, data }) => { let count = 0; for (const row of tables[name]) if (matches(row, where)) { Object.assign(row, data); count++; } return { count }; },
      update: async ({ where, data }) => { const row = await db[name].findUniqueOrThrow({ where }); Object.assign(row, data); return row; },
      upsert: async ({ where, create, update }) => { const row = await db[name].findUnique({ where }); if (row) { Object.assign(row, update); return row; } return db[name].create({ data: create }); },
      deleteMany: async ({ where }) => { const before = tables[name].length; tables[name] = tables[name].filter(row => !matches(row, where)); return { count: before - tables[name].length }; },
    };
  }
  return db;
}
(async () => {
  const baileys = await import('@whiskeysockets/baileys');
  process.env.WA_AUTH_ENCRYPTION_KEY = 'offline-test-key-never-use-in-production';
  const storage = load('src/server/libs/waStorage.ts', {});
  const sealed = storage.sealWa('private fixture', 'phone:key');
  assert(!sealed.includes('private fixture'));
  assert.equal(storage.openWa(sealed, 'phone:key'), 'private fixture');
  assert.throws(() => storage.openWa(sealed, 'other:key'));
  assert.throws(() => storage.openWa(sealed.slice(0, -4) + 'AAAA', 'phone:key'));
  const db = memoryDb();
  const authDeps = { '@whiskeysockets/baileys': baileys, '../../lib/prisma': { prisma: db }, './waStorage': storage };
  const auth = load('src/server/libs/waAuthState.ts', authDeps);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wa-hardening-'));
  try {
    const creds = baileys.initAuthCreds();
    fs.writeFileSync(path.join(dir, 'creds.json'), JSON.stringify(creds, baileys.BufferJSON.replacer));
    fs.writeFileSync(path.join(dir, 'tctoken-contact.json'), JSON.stringify({ token: Buffer.from('private-token') }, baileys.BufferJSON.replacer));
    const first = await auth.createDatabaseAuthState('phone', dir, () => {});
    assert.deepEqual(first.state.creds.noiseKey, creds.noiseKey, 'Import preserves existing identity');
    assert.deepEqual((await first.state.keys.get('tctoken', ['contact'])).contact.token, Buffer.from('private-token'));
    assert(db.tables.waAuthKey.every(row => row.value.startsWith('wa1:') && !row.value.includes('private-token')));
    await first.state.keys.set({ tctoken: { contact: { token: Buffer.from('updated') } } });
    await first.close();
    const next = await auth.createDatabaseAuthState('phone', dir, () => {});
    assert.equal((await next.state.keys.get('tctoken', ['contact'])).contact.token.toString(), 'updated', 'Restart uses DB rather than stale legacy files');
    await next.state.keys.set({ tctoken: { contact: null } });
    assert.equal((await next.state.keys.get('tctoken', ['contact'])).contact, null);
    const otherProcess = load('src/server/libs/waAuthState.ts', authDeps, {});
    await assert.rejects(otherProcess.createDatabaseAuthState('phone', dir, () => {}), /WA_AUTH_IN_USE/);
    await next.close();
    let leaseLost = 0;
    const old = await auth.createDatabaseAuthState('phone', dir, () => leaseLost++);
    db.tables.waAuthSession[0].leaseUntil = new Date(0);
    const takeover = await otherProcess.createDatabaseAuthState('phone', dir, () => {});
    await assert.rejects(old.saveCreds(), /WA_AUTH_LEASE_LOST/);
    assert.equal(leaseLost, 1, 'Stale process is fenced before key writes');
    await old.close().catch(() => {});
    await takeover.close();
    await auth.clearDatabaseAuth('phone');
    const loggedOut = await auth.createDatabaseAuthState('phone', dir, () => {});
    assert.notDeepEqual(loggedOut.state.creds.noiseKey, creds.noiseKey, 'Logout tombstone prevents stale file reimport');
    await loggedOut.close();
    fs.writeFileSync(path.join(dir, 'broken.json'), '{bad');
    await assert.rejects(auth.createDatabaseAuthState('corrupt', dir, () => {}));
    assert.equal(db.tables.waAuthKey.filter(row => row.phoneId === 'corrupt').length, 0);
    assert.equal(db.tables.waAuthSession.find(row => row.phoneId === 'corrupt').migratedAt, null);
  } finally { for (const name of fs.readdirSync(dir)) fs.unlinkSync(path.join(dir, name)); fs.rmdirSync(dir); }
  console.log('PASS encryption, identity-preserving import, token roundtrip/deletion, restart, lease competition/fencing, logout tombstone, corrupt import');

  class SendGuardError extends Error { constructor(code) { super(code); this.code = code; } }
  const restrictions = load('src/server/messaging/restrictions.ts', { '../../lib/prisma': { prisma: db }, './safety': { SendGuardError } });
  let calls = 0, locked = true, fail = false;
  const socket = { fetchAccountReachoutTimelock: async () => { calls++; if (fail) throw Error('Offline'); return { isActive: locked, enforcementType: 'WEB_COMPANION_ONLY', timeEnforcementEnds: new Date(0) }; }, fetchNewChatMessageCap: async () => ({ total_quota: 10, used_quota: 9 }) };
  await assert.rejects(restrictions.requireUnrestricted('r', socket), e => e.code === 'WA_ACCOUNT_RESTRICTED');
  await restrictions.recordRestriction('r', {});
  await assert.rejects(restrictions.requireUnrestricted('r', socket), e => e.code === 'WA_ACCOUNT_RESTRICTED');
  assert(db.tables.waRestriction.find(row => row.phoneId === 'r').active, 'Expiry/unknown event cannot clear active lock');
  locked = false; await restrictions.refreshRestrictions('r', socket); await restrictions.requireUnrestricted('r', socket);
  fail = true; await assert.rejects(restrictions.requireUnrestricted('r', { ...socket }), e => e.code === 'WA_RESTRICTION_UNKNOWN');
  fail = false; calls = 0; await Promise.all(Array.from({ length: 10 }, () => restrictions.refreshRestrictions('r', socket))); assert.equal(calls, 1);
  console.log('PASS active lock, unknown event, expiry, verified release, failed query, debounced checks');

  const messages = load('src/server/libs/waMessageStore.ts', { '@whiskeysockets/baileys': baileys, '../../lib/prisma': { prisma: db }, './waStorage': storage });
  const key = { id: 'id', remoteJid: '6281234567890@s.whatsapp.net', fromMe: true };
  await messages.storeProtocolMessage('p', { key, message: { conversation: 'private message' } });
  assert.equal((await messages.getProtocolMessage('p', key)).conversation, 'private message');
  assert.equal((await messages.getProtocolMessage('p', { ...key, participant: '6281234567890:7@s.whatsapp.net' })).conversation, 'private message', 'Device retry participant does not change outgoing message identity');
  assert.equal(await messages.getProtocolMessage('another', key), undefined);
  db.tables.waProtocolMessage[0].expiresAt = new Date(0);
  assert.equal(await messages.getProtocolMessage('p', key), undefined);
  let fetches = 0; const cache = messages.groupMetadataCache(() => ({ groupMetadata: async id => { fetches++; return { id }; } }));
  await Promise.all([cache.get('group'), cache.get('group')]); await cache.get('group'); assert.equal(fetches, 1);
  cache.invalidate('group'); await cache.get('group'); assert.equal(fetches, 2);
  console.log('PASS persistent encrypted getMessage, owner separation, expiry, group cache coalescing/invalidation');

  const events = [];
  const consent = load('src/pages/api/recipient-consents.ts', {
    zod: require('zod'), '@/middleware/apiAuthMiddleware': { __esModule: true, default: fn => fn }, '@/lib/prisma': { prisma: db },
    '@/utils/normalizePhoneRecipient': { normalizePhoneRecipient: value => { if (!/^628\d{8,12}$/.test(value)) throw Error('Invalid'); return value; } },
    '@/server/dispatchWebhook/events': { updateDispatches: async args => events.push(args) },
  }).default;
  const request = async (method, body, user = 'a') => { const res = { statusCode: 200, setHeader() {}, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; }, end() {} }; await consent({ method, body, query: {}, user: { id: user } }, res); return res; };
  const payload = { number: '6281234567890', purpose: 'ORDER_UPDATES', source: 'checkout', evidence: 'Form reference #123', grantedAt: new Date(Date.now() - 1000).toISOString(), consentConfirmed: true };
  assert.equal((await request('POST', { ...payload, consentConfirmed: false })).statusCode, 400);
  assert.equal((await request('POST', { ...payload, grantedAt: new Date(Date.now() + 3600000).toISOString() })).statusCode, 400);
  assert.equal((await request('POST', payload)).statusCode, 201);
  assert.equal((await request('GET', null, 'b')).body.total, 0, 'Consent is owner-scoped');
  assert.equal((await request('DELETE', { number: payload.number, reason: 'Customer request' })).statusCode, 200);
  assert(db.tables.recipientConsent[0].revokedAt); assert.equal(events.length, 1);
  assert.equal((await request('POST', payload)).statusCode, 409, 'Old consent cannot override STOP');
  assert.equal(db.tables.recipientConsentEvent.length, 2, 'Grant and revoke remain auditable');
  console.log('PASS consent contract, explicit permission, future-date rejection, ownership, revocation/suppression, stale consent rejection');
})().catch(error => { console.error(error); process.exitCode = 1; });

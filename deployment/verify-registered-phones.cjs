const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const { createRequire } = require('node:module');

function load(relative, stubs = {}) {
  const filename = path.resolve(__dirname, '..', relative);
  const source = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  }).outputText;
  const module = { exports: {} }, realRequire = createRequire(filename);
  new Function('require', 'module', 'exports', source)(
    name => Object.hasOwn(stubs, name) ? stubs[name] : realRequire(name), module, module.exports);
  return module.exports;
}
function response() {
  return { code: 200, headers: {}, status(code) { this.code = code; return this; },
    json(body) { if (body.result && Array.isArray(body.data)) for (const phone of body.data) assert.equal(phone.device_id, phone.id); this.body = body; return this; }, end() { return this; },
    setHeader(name, value) { this.headers[name] = value; } };
}

(async () => {
  const fixtures = [
    { id: 'a', userId: 'owner', number: '6281217357535', active: 0, isOnline: false, token: 'secret-a', qrCode: 'secret-qr' },
    { id: 'b', userId: 'other-owner', number: '6281217357535', token: 'secret-b' },
    { id: 'c', userId: 'owner', number: null, active: 1 },
  ];
  let approved = true, queries = 0, role = 'USER', email = 'user@example.com';
  const prisma = {
    user: { findUnique: async ({ where }) => { if (where.token && where.token !== 'user-token') return null; if (where.id) assert.equal(where.id, 'owner'); return { id: 'owner', role, email, approvalStatus: approved ? 'APPROVED' : 'REJECTED' }; } },
    phone: {
      findUnique: async ({ where }) => where.token === 'valid-token' ? fixtures[0] : null,
      findMany: async ({ where, select, take }) => {
        queries++;
        assert.equal(where.userId, role === 'ADMIN' && email === 'admin@gmail.com' ? undefined : 'owner'); assert.equal(take, undefined);
        assert.equal(select.token, role === 'ADMIN' && email === 'admin@gmail.com' ? true : undefined); assert.equal(select.qrCode, undefined);
        return fixtures.filter(p => (where.userId === undefined || p.userId === where.userId) && (where.number === undefined || p.number === where.number))
          .map(p => Object.fromEntries(Object.keys(select).map(key => [key, p[key] ?? null])));
      },
    },
  };
  const registered = load('src/server/registeredPhones.ts', {
    '@/lib/prisma': { prisma },
    '@/utils/normalizePhoneRecipient': load('src/utils/normalizePhoneRecipient.ts'),
    '@/lib/access': load('src/lib/access.ts'),
  });
  const handler = load('src/pages/api/public/[action].ts', {
    '@/server/deviceToken': load('src/server/deviceToken.ts'),
    '@/server/dispatchAuth': load('src/server/dispatchAuth.ts', { '@/lib/prisma': { prisma }, '@/lib/access': load('src/lib/access.ts') }),
    '@/server/deviceWebhook/events': load('src/server/deviceWebhook/events.ts'),
    '@/lib/prisma': { prisma }, '@/server/registeredPhones': registered,
    '@/server/dispatch/queue': {}, '@/server/dispatchWebhook/events': {}, '@/server/campaigns/content': {},
    '@/utils/normalizePhoneRecipient': {}, '@/server/libs/makeWASocket': {},
    '@/server/libs/qrState': {}, '@/server/libs/pairingState': {},
  }).default;
  const request = (action, body = {}, method = 'POST') => ({
    method, headers: { authorization: 'Bearer valid-token' },
    query: { action, ...(method === 'GET' ? body : {}) }, body,
  });
  process.env.WHATSAPP_ENABLED = 'false';
  let res = response(); await handler(request('list-phones'), res);
  assert.equal(res.code, 200); assert.equal(res.body.total, 2);
  assert.deepEqual(res.body.access, { role: 'USER', scope: 'own' });
  assert.deepEqual(res.body.data.map(p => p.id), ['a', 'c']);
  assert.equal(res.body.data[0].active, 0);
  assert.equal(res.body.data[0].token, undefined); assert.equal(res.body.data[0].qrCode, undefined);
  assert.equal(res.headers['Cache-Control'], 'no-store');
  fixtures[0].isOnline = true; fixtures[0].status = 'CLOSE';
  res = response(); await handler(request('phone-detail', { number: '6281217357535' }), res);
  assert.equal(res.body.data[0].status, 'OPEN', 'online detail must not export stale CLOSE');
  res = response(); await handler(request('list-phones'), res);
  assert.equal(res.body.data[0].status, 'OPEN', 'online list must match detail');
  fixtures[0].isOnline = false; fixtures[0].status = 'OPEN';
  res = response(); await handler(request('phone-detail', { number: '6281217357535' }), res);
  assert.equal(res.body.data[0].status, 'CLOSE', 'offline detail must not export stale OPEN');
  fixtures[0].status = 'CONNECTING';
  res = response(); await handler(request('phone-detail', { number: '6281217357535' }), res);
  assert.equal(res.body.data[0].status, 'CONNECTING', 'retain connecting state while offline');
  fixtures[0].status = null;
  res = response(); await handler(request('phone-detail', { number: '6281217357535' }), res);
  assert.equal(res.body.data[0].status, null, 'retain unknown state while offline');
  fixtures[0].isOnline = true;
  res = response(); await handler(request('phone-detail', { number: '6281217357535' }), res);
  assert.equal(res.body.data[0].status, 'OPEN', 'online connectivity overrides unknown status');
  fixtures[0].isOnline = false;
  fixtures[0].status = 'CLOSE';
  for (const method of ['GET', 'POST']) for (const number of ['081217357535', '6281217357535', '+62 (812) 1735-7535']) {
    res = response(); await handler(request('phone-detail', { number }, method), res);
    assert.equal(res.code, 200); assert.equal(res.body.number, '6281217357535');
    assert.equal(res.body.total, 1); assert.equal(res.body.data[0].id, 'a');
  }
  const beforeInvalid = queries;
  for (const number of [undefined, ['6281217357535'], 'abc', '0812,0813', '12']) {
    res = response(); await handler(request('phone-detail', { number }), res); assert.equal(res.code, 400);
  }
  assert.equal(queries, beforeInvalid);
  res = response(); await handler(request('phone-detail', { number: '6281234567890' }), res); assert.equal(res.code, 404);
  fixtures.push({ id: 'd', userId: 'owner', number: '6281217357535' });
  res = response(); await handler(request('phone-detail', { number: '081217357535' }), res);
  assert.equal(res.body.total, 2); assert.deepEqual(res.body.data.map(p => p.id), ['a', 'd']);
  // Client-supplied roles/scopes never grant access.
  res = response(); await handler(request('list-phones', { role: 'ADMIN', scope: 'all', userId: 'other-owner' }), res);
  assert.equal(res.body.total, 3); assert.equal(res.body.access.scope, 'own');
  // An ADMIN role alone cannot bypass the existing designated-admin rule.
  role = 'ADMIN';
  res = response(); await handler(request('list-phones'), res);
  assert.equal(res.body.total, 3); assert.equal(res.body.access.scope, 'own');
  email = 'admin@gmail.com';
  res = response(); await handler(request('list-phones'), res);
  assert.deepEqual(res.body.access, { role: 'ADMIN', scope: 'all' });
  assert.equal(res.body.total, 4); assert(res.body.data.some(p => p.userId === 'other-owner'));
  assert.equal(res.body.data[0].token, 'secret-a');
  res = response(); await handler(request('phone-detail', { number: '081217357535' }), res);
  assert.deepEqual(res.body.data.map(p => p.id), ['a', 'b', 'd']);
  assert.equal(res.body.access.scope, 'all');
  for (const method of ['GET', 'POST']) for (const action of ['list-phones', 'phone-detail']) {
    res = response(); await handler(request(action, { number: '081217357535' }, method), res);
    assert.equal(res.code, 200);
    assert.equal(res.body.data.find(p => p.id === 'a').token, 'secret-a');
    assert.equal(res.body.data.find(p => p.id === 'b').token, 'secret-b');
    assert(res.body.data.every(p => !Object.hasOwn(p, 'qrCode')));
  }
  // Both the role and designated account are required.
  role = 'USER';
  res = response(); await handler(request('list-phones'), res); assert.equal(res.body.access.scope, 'own');
  role = 'ADMIN'; approved = false;
  res = response(); await handler(request('list-phones'), res); assert.equal(res.code, 403);
  role = 'USER'; email = 'user@example.com'; approved = true;
  for (const identity of [{ role: 'USER', email: 'user@example.com' }, { role: 'ADMIN', email: 'other-admin@example.com' }, { role: 'USER', email: 'admin@gmail.com' }]) {
    role = identity.role; email = identity.email;
    for (const method of ['GET', 'POST']) for (const action of ['list-phones', 'phone-detail']) {
      res = response(); await handler(request(action, { number: '081217357535', role: 'ADMIN', scope: 'all', token: true }, method), res);
      assert.equal(res.code, 200); assert.equal(res.body.access.scope, 'own');
      assert(res.body.data.every(p => !Object.hasOwn(p, 'token') && !Object.hasOwn(p, 'qrCode')));
    }
  }
  role = 'USER'; email = 'user@example.com';
  for (const method of ['GET', 'POST']) for (const action of ['list-phones', 'phone-detail']) {
    res = response(); await handler({ ...request(action, { number: '081217357535' }, method), headers: { authorization: 'Bearer user-token' } }, res);
    assert.equal(res.code, 200); assert(res.body.data.length);
  }
  const beforeDenied = queries;
  approved = false; res = response(); await handler(request('list-phones'), res); assert.equal(res.code, 403);
  assert.equal(queries, beforeDenied); approved = true;
  for (const authorization of [undefined, 'Bearer invalid-token']) {
    res = response(); await handler({ ...request('list-phones'), headers: { authorization } }, res); assert.equal(res.code, 401);
  }
  res = response(); await handler({ ...request('list-phones', { api_key: 'valid-token' }), headers: {} }, res); assert.equal(res.code, 200);
  res = response(); await handler(request('list-phones', {}, 'DELETE'), res); assert.equal(res.code, 405);
  fixtures.length = 0;
  res = response(); await registered.registeredPhones('list-phones', 'owner', undefined, res);
  assert.deepEqual(res.body, { result: true, access: { role: 'USER', scope: 'own' }, total: 0, data: [] });
  fixtures.push({ id: 'a', userId: 'owner' });
  prisma.phone.findMany = async () => { throw new Error('private database failure'); };
  res = response(); await handler(request('list-phones'), res);
  assert.equal(res.code, 500); assert.equal(JSON.stringify(res.body).includes('private database failure'), false);
  console.log('REGISTERED_PHONES_OK: GET/POST admin-only device tokens, user-own access, role/scope spoofing rejected, approval enforcement, QR exclusion, normalization and validation');
})().catch(error => { console.error(error); process.exitCode = 1; });

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
require('@next/env').loadEnvConfig(process.cwd());
const { PrismaClient } = require('@prisma/client');
const { encode } = require('next-auth/jwt');
const { decryptAiKey } = require('../dist/src/server/ai/secrets');
const db = new PrismaClient();
const base = process.env.TEMPLATES_AI_TEST_BASE || 'http://127.0.0.1:3001';
const users = [], phones = [];
async function request(route, user, method = 'GET', body) {
  const headers = user ? { Authorization: `Bearer ${user.token}`, 'Content-Type': 'application/json' } : {};
  const response = await fetch(base + route, { method, headers, redirect: 'manual', ...(body ? { body: JSON.stringify(body) } : {}) });
  return { code: response.status, data: await response.json().catch(() => null) };
}
(async () => {
  const stamp = crypto.randomUUID();
  for (const suffix of ['a', 'b']) users.push(await db.user.create({ data: { name: 'Templates AI deploy check', email: `templates-ai-${stamp}-${suffix}@example.invalid`, password: crypto.randomBytes(32).toString('hex'), token: crypto.randomUUID(), approvalStatus: 'APPROVED', isActive: true } }));
  const [owner, other] = users;
  assert.equal((await request('/api/message-templates')).code, 401);
  assert.equal((await request('/api/ai-plugins')).code, 401);
  let result = await request('/api/message-templates', owner, 'POST', { name: 'Deploy fixture', content: 'Halo {nama}, pesanan {produk} siap.' });
  assert.equal(result.code, 201); const id = result.data.id;
  assert.equal((await request('/api/message-templates', owner)).data.total, 1);
  assert.equal((await request('/api/message-templates', other)).data.total, 0);
  assert.equal((await request(`/api/message-templates/${id}`, other, 'PATCH', { name: 'Unauthorized', content: 'No' })).code, 404);
  assert.equal((await request(`/api/message-templates/${id}`, other, 'DELETE')).code, 404);
  assert.equal((await request(`/api/message-templates/${id}`, owner, 'PATCH', { name: 'Updated fixture', content: 'Terima kasih {nama}.' })).code, 200);
  const settings = { enabled: false, model: 'fixture-model-no-provider-call', systemPrompt: 'Fixture only', maxOutputTokens: 1024, requestsPerMinute: 2, dailyLimit: 3 };
  for (const provider of ['openai', 'gemini', 'claude']) {
    const fakeKey = `fixture-not-a-real-api-key-${stamp}-${provider}`;
    result = await request('/api/ai-plugins', owner, 'POST', { ...settings, provider, apiKey: fakeKey });
    assert.equal(result.code, 200); assert.equal(result.data.hasKey, true);
    assert(!JSON.stringify(result.data).includes(fakeKey));
    const stored = await db.aiPlugin.findUniqueOrThrow({ where: { userId_provider: { userId: owner.id, provider } } });
    assert.notEqual(stored.encryptedKey, fakeKey); assert.equal(decryptAiKey(stored.encryptedKey), fakeKey);
    assert.equal((await request('/api/ai-plugins', owner, 'POST', { ...settings, provider, apiKey: '' })).code, 200);
    assert.equal((await db.aiPlugin.findUniqueOrThrow({ where: { id: stored.id } })).encryptedKey, stored.encryptedKey);
    result = await request('/api/ai-plugins/test', owner, 'POST', { provider, message: 'Must not call external provider: plugin disabled' });
    assert.equal(result.code, 400);
  }
  const publicConfigs = await request('/api/ai-plugins', owner);
  assert.equal(publicConfigs.data.data.length, 3); assert.equal(publicConfigs.data.encryptionReady, true);
  assert(!JSON.stringify(publicConfigs.data).includes('encryptedKey'));
  assert.equal((await request('/api/ai-plugins', other)).data.data.length, 0);
  assert.equal(await db.aiRequest.count({ where: { userId: { in: users.map(u => u.id) } } }), 0, 'Disabled plugin test must never call provider');
  // The disposable phone is inactive: the production recovery worker cannot connect it.
  const phone = await db.phone.create({ data: { userId: owner.id, name: 'AI deploy fixture (inactive)', active: 0, autoReplyEnabled: false } }); phones.push(phone);
  assert.equal((await request('/api/ai-plugins', owner, 'POST', { ...settings, provider: 'openai', enabled: true })).code, 200);
  const rule = { phoneId: phone.id, type_message: 'ai', type_keyword: 'Any', aiProvider: 'openai', aiInstructions: 'Fixture only' };
  assert.equal((await request('/api/auto_reply', other, 'POST', rule)).code, 404);
  result = await request('/api/auto_reply', owner, 'POST', rule);
  assert.equal(result.code, 200); assert.equal(result.data.type, 'ai'); assert.equal(result.data.reply_when, 'Personal'); assert.equal(result.data.reply_status, 'inactive');
  assert.equal((await request('/api/ai-plugins', owner, 'POST', { ...settings, provider: 'openai', enabled: false, removeKey: true })).code, 200);
  for (const route of ['/dashboard/message-templates', '/dashboard/ai-plugins']) {
    const jwt = await encode({ token: { id: owner.id, sessionVersion: owner.sessionVersion }, secret: process.env.NEXTAUTH_SECRET });
    const page = await fetch(base + route, { headers: { Cookie: `__Secure-next-auth.session-token=${jwt}; next-auth.session-token=${jwt}` }, redirect: 'manual' });
    assert.equal(page.status, 200); assert((await page.text()).includes(route.endsWith('ai-plugins') ? 'Plugin AI' : 'Template Pesan'));
  }
  assert.equal((await request(`/api/message-templates/${id}`, owner, 'DELETE')).code, 200);
  console.log('TEMPLATES_AI_LIVE_OK: real DB/authenticated CRUD, owner isolation, encrypted keys, provider settings, disabled-provider guard, AI rule persistence and pages; zero external AI/WhatsApp calls');
})().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(async () => {
  const ids = users.map(user => user.id);
  if (ids.length) {
    await db.autoReply.deleteMany({ where: { userId: { in: ids } } });
    await db.aiRequest.deleteMany({ where: { userId: { in: ids } } });
    await db.aiPlugin.deleteMany({ where: { userId: { in: ids } } });
    await db.messageTemplate.deleteMany({ where: { userId: { in: ids } } });
    await db.phone.deleteMany({ where: { id: { in: phones.map(phone => phone.id) } } });
    await db.user.deleteMany({ where: { id: { in: ids } } });
  }
  await db.$disconnect(); console.log('TEMPLATES_AI_FIXTURES_REMOVED');
});

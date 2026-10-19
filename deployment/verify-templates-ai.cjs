/* Offline behavior checks: never calls an AI provider, database, or WhatsApp. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const { createRequire } = require('node:module');
function load(relative, stubs = {}) {
  const file = path.resolve(__dirname, '..', relative), realRequire = createRequire(file), mod = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  new Function('require', 'module', 'exports', code)(name => {
    if (Object.hasOwn(stubs, name)) return stubs[name];
    if (name.startsWith('@/')) return load('src/' + name.slice(2) + '.ts', stubs);
    if (name.startsWith('.')) return load(path.relative(path.resolve(__dirname, '..'), path.resolve(path.dirname(file), name)) + '.ts', stubs);
    return realRequire(name);
  }, mod, mod.exports);
  return mod.exports;
}
const defaultExport = value => ({ __esModule: true, default: value });
const response = () => ({ code: 200, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; }, setHeader() {}, end() { return this; } });
const originalFetch = global.fetch, originalKey = process.env.AI_SECRET_KEY;
const originalWaEnabled = process.env.WHATSAPP_ENABLED;
const originalShutdown = process.env.DORAN_SHUTTING_DOWN;
(async () => {
  const templates = load('src/lib/messageTemplates.ts');
  assert.deepEqual(templates.templateVariables('Halo {nama} {produk} {nama} {constructor}'), ['nama', 'produk', 'constructor']);
  assert.equal(templates.renderMessageTemplate('{nama} {produk} {constructor}', { nama: '{produk}', produk: '$100' }), '{produk} $100 {constructor}');
  assert(!templates.templateInput.safeParse({ name: ' ', content: 'test' }).success);
  assert(!templates.templateInput.safeParse({ name: 'test', content: 'x'.repeat(10001) }).success);

  const secrets = load('src/server/ai/secrets.ts');
  process.env.AI_SECRET_KEY = 'a'.repeat(64);
  const encrypted = secrets.encryptAiKey('fake-provider-secret');
  assert(!encrypted.includes('fake-provider-secret'));
  assert.equal(secrets.decryptAiKey(encrypted), 'fake-provider-secret');
  assert.notEqual(encrypted, secrets.encryptAiKey('fake-provider-secret'));
  const bits = encrypted.split(':'); bits[2] = '0'.repeat(32);
  assert.throws(() => secrets.decryptAiKey(bits.join(':')));
  process.env.AI_SECRET_KEY = 'b'.repeat(64);
  assert.throws(() => secrets.decryptAiKey(encrypted));
  process.env.AI_SECRET_KEY = '';
  assert.throws(() => secrets.encryptAiKey('fake'), /AI_SECRET_KEY/);
  process.env.AI_SECRET_KEY = 'a'.repeat(64);

  const providers = load('src/server/ai/providers.ts');
  const input = { apiKey: 'fake-provider-secret', model: 'model-test', systemPrompt: 'Instruksi', message: 'Halo', maxOutputTokens: 1024 };
  const fixtures = {
    openai: { status: 'completed', output: [{ type: 'reasoning', content: [{ text: 'hidden' }] }, { type: 'message', content: [{ type: 'output_text', text: 'Halo OpenAI' }] }] },
    gemini: { candidates: [{ finishReason: 'STOP', content: { parts: [{ thought: true, text: 'hidden' }, { text: 'Halo Gemini' }] } }] },
    claude: { stop_reason: 'end_turn', content: [{ type: 'thinking', thinking: 'hidden' }, { type: 'text', text: 'Halo Claude' }] },
  };
  for (const provider of ['openai', 'gemini', 'claude']) {
    let called = 0;
    global.fetch = async (url, options) => {
      called++;
      assert.equal(options.redirect, 'error');
      assert(!url.includes(input.apiKey));
      const body = JSON.parse(options.body);
      assert.equal(body.model || url.includes('model-test'), provider === 'gemini' ? true : 'model-test');
      if (provider === 'openai') { assert.equal(body.store, false); assert.equal(body.input, 'Halo'); assert.equal(options.headers.Authorization, 'Bearer fake-provider-secret'); }
      if (provider === 'gemini') { assert.equal(body.systemInstruction.parts[0].text, 'Instruksi'); assert.equal(options.headers['x-goog-api-key'], input.apiKey); }
      if (provider === 'claude') { assert.equal(body.max_tokens, 1024); assert.equal(options.headers['anthropic-version'], '2023-06-01'); }
      return { ok: true, json: async () => fixtures[provider] };
    };
    const result = await providers.generateAiText({ ...input, provider });
    assert(result.startsWith('Halo ')); assert(!result.includes('hidden')); assert.equal(called, 1);
  }
  assert.throws(() => providers.parseAiResponse('openai', { status: 'incomplete', output: [] }), /lengkap/);
  assert.throws(() => providers.parseAiResponse('gemini', { candidates: [{ finishReason: 'SAFETY' }] }), /dibatasi/);
  assert.throws(() => providers.parseAiResponse('claude', { stop_reason: 'max_tokens' }), /lengkap/);
  assert.throws(() => providers.parseAiResponse('openai', { status: 'completed', output: [] }), /teks/);
  global.fetch = async () => ({ ok: false, status: 401 });
  await assert.rejects(providers.generateAiText({ ...input, provider: 'openai' }), e => e.code === 'AI_AUTH' && !e.message.includes(input.apiKey));
  global.fetch = async () => { throw new Error('Authorization: ' + input.apiKey); };
  await assert.rejects(providers.generateAiText({ ...input, provider: 'openai' }), e => e.code === 'AI_CONNECTION' && !e.message.includes(input.apiKey));

  let userActive = true, liveRule = true, enabled = true, sends = 0, generated = 0;
  const revision = new Date();
  const config = { id: 'config', userId: 'owner', provider: 'openai', enabled: true, encryptedKey: encrypted, model: 'model-test', systemPrompt: 'Business', maxOutputTokens: 1024, requestsPerMinute: 2, dailyLimit: 3, updatedAt: revision };
  const requests = [];
  const tx = {
    $queryRaw: async () => [], user: { findUnique: async () => ({ isActive: userActive, approvalStatus: 'APPROVED' }) },
    aiPlugin: { findUnique: async () => ({ ...config, enabled }) },
    aiRequest: {
      findUnique: async ({ where }) => requests.find(r => r.dedupeKey === where.dedupeKey),
      count: async ({ where }) => requests.filter(r => r.createdAt >= where.createdAt.gte).length,
      create: async ({ data }) => { const row = { ...data, id: 'req-' + requests.length, createdAt: new Date() }; requests.push(row); return row; },
      update: async ({ where, data }) => Object.assign(requests.find(r => r.id === where.id), data),
    },
  };
  const rule = { id: 1, userId: 'owner', phoneId: 'phone', reply: { provider: 'openai', instructions: 'Extra' }, type: 'ai', reply_status: 'active', reply_when: 'All', delaySeconds: 0, updatedAt: revision };
  const db = { ...tx, $transaction: async fn => fn(tx), autoReply: { findFirst: async () => liveRule ? rule : null, updateMany: async () => ({ count: 1 }) } };
  const service = load('src/server/ai/service.ts', {
    '../../lib/prisma': { prisma: db }, './secrets': secrets,
    './providers': { ...providers, generateAiText: async () => { generated++; return 'Jawaban AI'; } },
    '../chat/store': { captureChatMessage: async () => {} },
    '../libs/phoneMaintenance': { phoneMaintenance: new Set(), retiredSockets: new WeakSet() },
  });
  const first = await service.requestAiReply('owner', 'openai', 'Hello', '', 'message-1');
  assert(first.text); assert.equal(generated, 1);
  assert.equal(await service.requestAiReply('owner', 'openai', 'Hello', '', 'message-1'), null);
  assert.equal(generated, 1);
  await service.requestAiReply('owner', 'openai', 'Hello', '', 'message-2');
  await assert.rejects(service.requestAiReply('owner', 'openai', 'Hello', '', 'message-3'), e => e.code === 'AI_RATE_LIMIT');
  requests.forEach(r => r.createdAt = new Date(Date.now() - 120000));
  await service.requestAiReply('owner', 'openai', 'Hello', '', 'message-3');
  await assert.rejects(service.requestAiReply('owner', 'openai', 'Hello', '', 'message-4'), e => e.code === 'AI_RATE_LIMIT');
  requests.length = 0; userActive = false;
  await assert.rejects(service.requestAiReply('owner', 'openai', 'Hello'), e => e.code === 'AI_ACCOUNT');
  userActive = true; enabled = false;
  await assert.rejects(service.requestAiReply('owner', 'openai', 'Hello'), e => e.code === 'AI_DISABLED');
  enabled = true;
  await assert.rejects(service.requestAiReply('owner', 'openai', 'x'.repeat(4001)), e => e.code === 'AI_INPUT');
  process.env.WHATSAPP_ENABLED = 'true'; process.env.DORAN_SHUTTING_DOWN = 'false';
  const socket = { ws: { isOpen: true }, sendMessage: async () => { sends++; return { key: { id: 'sent' } }; } };
  const phone = { id: 'phone', userId: 'owner', showTyping: false };
  const incoming = { key: { id: 'incoming', remoteJid: '6281234567890@s.whatsapp.net', fromMe: false }, messageTimestamp: Math.floor(Date.now() / 1000) };
  await service.sendAiAutoReply(rule, phone, socket, { ...incoming, messageTimestamp: Math.floor(Date.now() / 1000) - 600 }, 'Hello');
  assert.equal(requests.length, 0);
  await service.sendAiAutoReply(rule, phone, socket, { ...incoming, key: { ...incoming.key, fromMe: true } }, 'Hello');
  assert.equal(requests.length, 0);
  await service.sendAiAutoReply(rule, phone, socket, incoming, 'Hello');
  await service.sendAiAutoReply(rule, phone, socket, incoming, 'Hello');
  assert.equal(sends, 1); assert.equal(requests[0].status, 'SENT');
  requests.length = 0;
  const cancellable = load('src/server/ai/service.ts', {
    '../../lib/prisma': { prisma: db }, './secrets': secrets,
    './providers': { ...providers, generateAiText: async () => { liveRule = false; return 'Jawaban dibatalkan'; } },
    '../chat/store': { captureChatMessage: async () => {} }, '../libs/phoneMaintenance': { phoneMaintenance: new Set(), retiredSockets: new WeakSet() },
  });
  await cancellable.sendAiAutoReply(rule, phone, socket, incoming, 'Hello');
  assert.equal(sends, 1); assert.equal(requests[0].status, 'CANCELLED'); liveRule = true;

  const middlewareStub = { '@/middleware/apiAuthMiddleware': defaultExport(fn => fn) };
  let templateWhere;
  const templateDb = { messageTemplate: {
    findMany: async ({ where }) => { templateWhere = where; return []; }, count: async () => 0,
    updateMany: async ({ where }) => { templateWhere = where; return { count: 0 }; },
    deleteMany: async ({ where }) => { templateWhere = where; return { count: 0 }; },
  } };
  const listHandler = load('src/pages/api/message-templates/index.ts', { ...middlewareStub, '@/lib/prisma': { prisma: templateDb } }).default;
  let res = response(); await listHandler({ method: 'GET', user: { id: 'owner', role: 'ADMIN' }, query: { q: 'hello' } }, res);
  assert.equal(templateWhere.userId, 'owner'); assert.equal(res.code, 200);
  const templateHandler = load('src/pages/api/message-templates/[id].ts', { ...middlewareStub, '@/lib/prisma': { prisma: templateDb } }).default;
  res = response(); await templateHandler({ method: 'PATCH', user: { id: 'other' }, query: { id: 'template-owner' }, body: { name: 'Edit', content: 'Hello' } }, res);
  assert.equal(templateWhere.userId, 'other'); assert.equal(res.code, 404);
  res = response(); await templateHandler({ method: 'DELETE', user: { id: 'other' }, query: { id: 'template-owner' } }, res);
  assert.equal(templateWhere.userId, 'other'); assert.equal(res.code, 404);

  let saved;
  const pluginDb = { aiPlugin: {
    findMany: async ({ where }) => { assert.equal(where.userId, 'owner'); return [{ ...config }]; }, findUnique: async () => config,
    upsert: async ({ create, update, select }) => { assert(!select.encryptedKey); saved = update; const { encryptedKey, ...safe } = create; return safe; },
  }, aiRequest: { findMany: async () => [] } };
  const pluginHandler = load('src/pages/api/ai-plugins/index.ts', { ...middlewareStub, '@/lib/prisma': { prisma: pluginDb }, '@/server/ai/secrets': secrets }).default;
  res = response(); await pluginHandler({ method: 'GET', user: { id: 'owner' } }, res);
  assert.equal(res.body.data[0].hasKey, true); assert(!JSON.stringify(res.body).includes(encrypted));
  const body = { ...config }; delete body.encryptedKey;
  res = response(); await pluginHandler({ method: 'POST', user: { id: 'owner' }, body }, res);
  assert.equal(res.code, 200); assert.equal(saved.encryptedKey, encrypted);
  res = response(); await pluginHandler({ method: 'POST', user: { id: 'owner' }, body: { ...body, removeKey: true } }, res);
  assert.equal(res.code, 400);
  res = response(); await pluginHandler({ method: 'POST', user: { id: 'owner' }, body: { ...body, enabled: false, removeKey: true } }, res);
  assert.equal(res.code, 200); assert.equal(saved.encryptedKey, '');
  let aiRulePosted = false;
  const hook = load('src/lib/useAutoReplyData.ts', {
    react: { useState: value => [value, () => {}], useRef: value => ({ current: value }), useEffect: () => {} },
    axios: { __esModule: true, AxiosError: require('axios').AxiosError, default: { post: async (url, body) => {
      assert.equal(url, '/api/auto_reply'); assert.equal(body.type_message, 'ai'); assert.equal(body.aiProvider, 'gemini'); aiRulePosted = true; return { data: { id: 1 } };
    } } },
  }).default;
  const hookResult = await hook('test-token', 'phone').save({ type_message: 'ai', aiProvider: 'gemini', aiInstructions: 'Business', phoneId: 'phone' });
  assert.equal(hookResult.success, true); assert.equal(aiRulePosted, true);
  let savedRule, providerEnabled = true;
  const autoReplyDb = {
    phone: { findFirst: async () => ({ id: 'phone', userId: 'device-owner' }) },
    aiPlugin: { findUnique: async ({ where }) => { assert.equal(where.userId_provider.userId, 'device-owner'); return { enabled: providerEnabled, encryptedKey: encrypted }; } },
    autoReply: { create: async ({ data }) => { savedRule = data; return data; } },
  };
  const ruleHandler = load('src/pages/api/auto_reply/index.ts', {
    ...middlewareStub, '@/lib/prisma': { prisma: autoReplyDb }, 'next-auth/jwt': { getToken: async () => null },
    '@/lib/access': { ownerScope: () => ({}) }, '@/server/campaigns/content': { publicPayload: { parse: value => value } },
  }).default;
  const ruleBody = { type_message: 'ai', type_keyword: 'Any', phoneId: 'phone', aiProvider: 'gemini', aiInstructions: 'Business' };
  res = response(); await ruleHandler({ method: 'POST', user: { id: 'admin' }, body: { ...ruleBody } }, res);
  assert.equal(res.code, 200); assert.equal(savedRule.userId, 'device-owner'); assert.equal(savedRule.reply_when, 'Personal');
  assert.deepEqual(savedRule.reply, { provider: 'gemini', instructions: 'Business' });
  providerEnabled = false;
  res = response(); await ruleHandler({ method: 'POST', user: { id: 'admin' }, body: { ...ruleBody } }, res);
  assert.equal(res.code, 400);
  console.log('PASS: template variables/ownership; encrypted keys/redaction; three provider transports; quotas/dedupe; live-message guards; cancellation; key retention/removal. No external requests.');
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => {
  global.fetch = originalFetch;
  for (const [key, value] of Object.entries({ AI_SECRET_KEY: originalKey, WHATSAPP_ENABLED: originalWaEnabled, DORAN_SHUTTING_DOWN: originalShutdown })) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
});

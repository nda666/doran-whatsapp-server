// Offline regression checks: no provider, database, or WhatsApp calls.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const ts = require('typescript');
function load(name, stubs = {}) {
  const file = path.resolve(__dirname, '..', name), mod = { exports: {} }, req = createRequire(file);
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  new Function('require', 'module', 'exports', code)(id => Object.hasOwn(stubs, id) ? stubs[id] : req(id), mod, mod.exports);
  return mod.exports;
}
const lib = load('src/lib/aiPlugins.ts');
const providers = load('src/server/ai/providers.ts', { '../../lib/aiPlugins': lib });
const originalFetch = global.fetch;
(async () => {
  const input = { provider: 'gemini', apiKey: 'fake-secret', model: 'fixture', systemPrompt: 'Fixture', message: 'Halo', maxOutputTokens: 1024 };
  for (const [status, code] of [[503, 'AI_PROVIDER_BUSY'], [529, 'AI_PROVIDER_BUSY'], [500, 'AI_PROVIDER_UNAVAILABLE'], [429, 'AI_PROVIDER_LIMIT'], [403, 'AI_AUTH'], [404, 'AI_PROVIDER_ERROR']]) {
    let calls = 0;
    global.fetch = async () => { calls++; return { ok: false, status, json: () => { throw new Error('Provider body must stay private'); } }; };
    let failure;
    try { await providers.generateAiText(input); } catch (error) { failure = error; }
    assert.equal(failure.code, code); assert.equal(calls, 1, 'Do not retry automatically');
    assert(!failure.message.includes(input.apiKey));
    if (status === 503) assert.match(failure.message, /Gemini AI sedang sibuk/);
    const handler = load('src/pages/api/ai-plugins/test.ts', {
      '@/lib/aiPlugins': lib,
      '@/middleware/apiAuthMiddleware': { __esModule: true, default: fn => fn },
      '@/server/ai/providers': providers,
      '@/server/ai/service': { requestAiReply: async () => { throw failure; } },
    }).default;
    const res = { statusCode: 200, setHeader() {}, status(value) { this.statusCode = value; return this; }, json(value) { this.body = value; return this; } };
    await handler({ method: 'POST', user: { id: 'fixture' }, body: { provider: 'gemini', message: 'Halo' } }, res);
    assert.equal(res.statusCode, failure.status >= 500 ? 422 : failure.status);
    assert.deepEqual(res.body, { code, message: failure.message });
  }
  console.log('AI_PROVIDER_ERRORS_OK');
})().finally(() => { global.fetch = originalFetch; }).catch(error => { console.error(error); process.exitCode = 1; });

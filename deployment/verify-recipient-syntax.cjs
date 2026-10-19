'use strict';
// Validate queue and legacy transports with synthetic payloads and mock sockets.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const ts = require('typescript'), { createRequire } = require('node:module');
const root = path.resolve(__dirname, '..'), cache = new Map(), sends = [];
const socket = { sendMessage: async jid => { sends.push(jid); return { key: { id: 'synthetic' } }; } };
const stubs = {
  'src/lib/prisma.ts': { prisma: {} },
  'src/server/dispatchWebhook/events.ts': {},
  'src/server/libs/makeWASocket.ts': { __esModule: true, default: async () => socket },
  'src/server/libs/toBase64.ts': { __esModule: true, default: async () => 'synthetic' },
};
function load(name) {
  if (stubs[name]) return stubs[name];
  if (cache.has(name)) return cache.get(name);
  const file = path.join(root, name), real = createRequire(file), module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: 1, target: 7, esModuleInterop: true } }).outputText;
  const req = spec => {
    if (spec === '@whiskeysockets/baileys') return { delay: async () => {} };
    return spec.startsWith('.') ? load(path.posix.normalize(path.posix.join(path.posix.dirname(name), spec)) + '.ts') : real(spec);
  };
  new Function('require', 'module', 'exports', code)(req, module, module.exports);
  cache.set(name, module.exports); return module.exports;
}
(async () => {
  const { normalizePhoneRecipient: normalize } = load('src/utils/normalizePhoneRecipient.ts');
  const { prepareDispatch } = load('src/server/dispatch/queue.ts');
  const { SendMessageValidation } = load('src/validations/sendMessage.ts');
  const { SendAttachmentValidation } = load('src/validations/sendAttachment.ts');
  for (const [input, expected, country] of [
    ['+6179063947', '6179063947'], ['+61 7906-3947', '6179063947'],
    ['+62811', '62811'], ['62811', '62811'], ['0812345', '62812345'],
    ['081234567890', '6281234567890'], ['6281234567890', '6281234567890'],
    ['+1 (202) 555-0123', '12025550123'], ['0412345678', '61412345678', 'AU'],
  ]) {
    assert.equal(normalize(input, country), expected);
    const body = { number: input, phoneCountry: country, message: 'synthetic', api_key: 'synthetic' };
    assert.equal(prepareDispatch('phone', 'user', body).jobs[0].recipient, expected);
    assert.equal((await SendMessageValidation(body)).result, true);
    assert.equal((await SendAttachmentValidation(body)).result, true);
  }
  for (const input of ['', '+61abc79063947', '++6179063947', '+61+79063947', '123',
    '+99912345678', '+6179063947@s.whatsapp.net', '+1234567890123456', '12345 ext 99']) {
    assert.throws(() => normalize(input));
    assert.throws(() => prepareDispatch('phone', 'user', { number: input, message: 'test' }));
    assert.equal((await SendMessageValidation({ number: input, message: 'test' })).result, false);
  }
  assert.throws(() => normalize('+6179063947', 'ZZ'));
  assert.throws(() => prepareDispatch('phone', 'user', { number: '+6179063947,invalid', message: 'test' }));
  assert.equal(prepareDispatch('phone', 'user', { number: '081234567890,6281234567890,+6281234567890', message: 'test' }).jobs.length, 1);
  const sendText = load('src/server/libs/sendMessageFromIo.ts').default;
  await sendText({ phoneId: 'phone', userId: 'user', tos: ['+6179063947'], phoneCountry: 'ID', message: 'synthetic' });
  const sendAttachment = load('src/server/libs/sendAttachmentMessageIo.ts').default;
  await sendAttachment({ phoneId: 'phone', userId: 'user', tos: ['+6179063947'], phoneCountry: 'ID', caption: 'synthetic', image: 'https://example.test/synthetic.png' });
  assert.deepEqual(sends, ['6179063947@s.whatsapp.net', '6179063947@s.whatsapp.net']);
  console.log('RECIPIENT_SYNTAX_TESTS_PASSED: legacy/international numbers accepted by queue and both validators/transports, Indonesian normalization, malformed/unknown-country/oversized numbers rejected, dedupe preserved; zero real messages');
})().catch(error => { console.error(error); process.exitCode = 1; });

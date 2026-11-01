'use strict';
// Offline behavioral checks: no production database, WhatsApp or external network.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { Writable } = require('node:stream');
const { createRequire } = require('node:module');
const ts = require('typescript');
function load(relative, stubs = {}) {
  const filename = path.resolve(__dirname, '..', relative), module = { exports: {} }, real = createRequire(filename);
  const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText;
  new Function('require', 'module', 'exports', code)(name => Object.hasOwn(stubs, name) ? stubs[name] : real(name), module, module.exports);
  return module.exports;
}
class Response extends Writable {
  constructor(fail = false) { super(); this.statusCode = 200; this.headers = {}; this.chunks = []; this.fail = fail; }
  setHeader(key, value) { this.headers[key] = value; }
  _write(chunk, _encoding, callback) { this.chunks.push(Buffer.from(chunk)); callback(this.fail ? new Error('CLIENT_DISCONNECT') : null); }
  get body() { return Buffer.concat(this.chunks).toString(); }
}
(async () => {
  const claims = new Set();
  const db = { waIncomingEffect: { create: async ({ data }) => {
    const id = JSON.stringify([data.phoneId, data.keyHash, data.action]);
    if (claims.has(id)) throw Object.assign(new Error('duplicate'), { code: 'P2002' });
    claims.add(id); return data;
  } } };
  const deps = { '../../lib/prisma': { prisma: db } };
  const dedupe = load('src/server/messaging/incomingDedupe.ts', deps);
  const key = { id: 'message-1', remoteJid: '628123456789@s.whatsapp.net' };
  assert.equal(await dedupe.claimLiveIncoming('p', key, 'append'), false);
  assert.equal(claims.size, 0, 'History must not consume a live claim');
  assert.equal(await dedupe.claimLiveIncoming('p', key, 'notify'), true);
  const restarted = load('src/server/messaging/incomingDedupe.ts', deps);
  assert.equal(await restarted.claimLiveIncoming('p', key, 'notify'), false, 'A fresh module/process sees persisted claims');
  const concurrent = await Promise.all(Array.from({ length: 20 }, () => restarted.claimLiveIncoming('p', { ...key, id: 'concurrent' }, 'notify')));
  assert.equal(concurrent.filter(Boolean).length, 1);
  assert.equal(await restarted.claimLiveIncoming('q', key, 'notify'), true, 'Different devices do not suppress each other');
  assert.equal(await restarted.claimLiveIncoming('p', { ...key, remoteJid: 'other@g.us' }, 'notify'), true);
  assert.equal(await restarted.claimLiveIncoming('p', { remoteJid: key.remoteJid }, 'notify'), false);
  assert.equal(await restarted.claimLiveIncoming('p', { ...key, fromMe: true }, 'notify'), false);
  await assert.rejects(restarted.claimIncoming('p', key, 'LIVE', { waIncomingEffect: { create: async () => { throw Error('DB_UNAVAILABLE'); } } }), /DB_UNAVAILABLE/);
  assert.equal(await restarted.claimIncoming('p', key, 'STOP'), true, 'STOP is a separate transactional action');
  assert.equal(await restarted.claimIncoming('p', key, 'STOP'), false);
  const alias = { id: 'alias', remoteJid: '123@lid', remoteJidAlt: key.remoteJid };
  assert.equal(await restarted.claimLiveIncoming('p', alias, 'notify'), true);
  assert.equal(await restarted.claimLiveIncoming('p', { ...alias, remoteJid: key.remoteJid, remoteJidAlt: '123@lid' }, 'notify'), false, 'PN/LID reversal keeps the same identity');

  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'wa-media-retention-'));
  const chat = path.join(dir, 'chat'), assets = path.join(dir, 'assets');
  await fsp.mkdir(chat); await fsp.mkdir(assets);
  const previousMedia = process.env.CHAT_MEDIA_RETENTION_DAYS, previousContent = process.env.CHAT_CONTENT_RETENTION_DAYS;
  try {
    const mediaSource = fs.readFileSync(path.resolve(__dirname, '../src/server/chat/media.ts'), 'utf8');
    // Bind only the test's media root; execute the actual streaming implementation.
    const filename = path.join(dir, 'media.ts'), mod = { exports: {} };
    const source = mediaSource.replace('path.resolve("storage", "chat-media")', JSON.stringify(chat));
    new Function('require', 'module', 'exports', ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText)(require, mod, mod.exports);
    const media = mod.exports;
    async function* chunks() { yield Buffer.from('hello'); yield Buffer.from(' world'); }
    const uploaded = await media.writeChatMedia(chunks(), 11);
    assert.equal(await fsp.readFile(media.chatMediaPath(uploaded), 'utf8'), 'hello world');
    const before = (await fsp.readdir(chat)).length;
    await assert.rejects(media.writeChatMedia(chunks(), 10), /CHAT_MEDIA_TOO_LARGE/);
    assert.equal((await fsp.readdir(chat)).length, before, 'Overflow removes partial files');
    async function* broken() { yield Buffer.from('part'); throw Error('DOWNLOAD_FAILED'); }
    await assert.rejects(media.writeChatMedia(broken(), 100), /DOWNLOAD_FAILED/);
    assert.equal((await fsp.readdir(chat)).length, before);

    const streaming = load('src/server/utils/streamFile.ts');
    for (const [range, status, body, contentRange] of [
      [undefined, 200, 'hello world', undefined], ['bytes=0-4', 206, 'hello', 'bytes 0-4/11'],
      ['bytes=-5', 206, 'world', 'bytes 6-10/11'], ['bytes=6-', 206, 'world', 'bytes 6-10/11'],
      ['bytes=9-100', 206, 'ld', 'bytes 9-10/11'], ['bytes=50-', 416, '', 'bytes */11'],
      ['bytes=0-1,3-4', 416, '', 'bytes */11'], ['bytes=-0', 416, '', 'bytes */11'],
    ]) {
      const res = new Response(); await streaming.streamFile(media.chatMediaPath(uploaded), res, range);
      assert.equal(res.statusCode, status); assert.equal(res.body, body); assert.equal(res.headers['Content-Range'], contentRange);
    }
    const head = new Response(); await streaming.streamFile(media.chatMediaPath(uploaded), head, 'bytes=0-4', true);
    assert.equal(head.body, ''); assert.equal(head.headers['Content-Length'], 11); assert.equal(head.statusCode, 200);
    const missing = new Response(); await streaming.streamFile(path.join(chat, 'missing'), missing); assert.equal(missing.statusCode, 404);
    const aborted = new Response(true); aborted.on('error', () => {});
    await streaming.streamFile(media.chatMediaPath(uploaded), aborted); assert(aborted.destroyed);

    const now = new Date(Date.now() + 100 * 86400000);
    const protectedFile = '11111111-1111-1111-1111-111111111111.bin';
    const recentFile = '22222222-2222-2222-2222-222222222222.bin';
    const libraryFile = '33333333-3333-3333-3333-333333333333.jpg';
    const assetOrphan = '44444444-4444-4444-4444-444444444444.jpg';
    await fsp.writeFile(path.join(chat, protectedFile), 'keep uncertain');
    await fsp.writeFile(path.join(chat, recentFile), 'in flight');
    await fsp.utimes(path.join(chat, recentFile), now, now);
    await fsp.writeFile(path.join(assets, libraryFile), 'library');
    await fsp.writeFile(path.join(assets, assetOrphan), 'orphan');
    await fsp.writeFile(path.join(chat, 'unrelated.txt'), 'do not touch');
    const rows = [
      { id: 'expired', conversationId: 'conversation', status: 'SENT', mediaPath: uploaded, text: 'old body', quotedText: 'quote' },
      { id: 'pending', conversationId: 'conversation', status: 'UNCERTAIN', mediaPath: protectedFile, text: 'pending', quotedText: null },
    ];
    let previewCleared = false;
    function eligible(row, where) { return !where.status.notIn.includes(row.status) && (!where.mediaPath || row.mediaPath !== null) && (!where.OR || row.text !== '' || row.quotedText !== null); }
    const retentionDb = { chatMessage: {
      findMany: async ({ where }) => rows.filter(row => eligible(row, where)),
      updateMany: async ({ where, data }) => { let count = 0; for (const row of rows) if (where.id.in.includes(row.id) && eligible(row, where)) { Object.assign(row, data); count++; } return { count }; },
      findFirst: async ({ where }) => rows.find(row => row.mediaPath === where.mediaPath),
    }, chatConversation: { updateMany: async () => { previewCleared = true; } },
      mediaAsset: { findFirst: async ({ where }) => where.filename === libraryFile ? { id: 'asset' } : null },
    };
    retentionDb.$transaction = fn => fn(retentionDb);
    const retention = load('src/server/chat/retention.ts', {
      '../../lib/prisma': { prisma: retentionDb }, './media': { chatMediaDirectory: () => chat }, '../campaigns/media': { mediaDirectory: () => assets },
    });
    assert.equal(retention.retentionDays('0'), 0); assert.equal(retention.retentionDays('29'), 0); assert.equal(retention.retentionDays('30'), 30);
    assert.equal(retention.retentionDays('invalid'), 0);
    delete process.env.CHAT_MEDIA_RETENTION_DAYS; delete process.env.CHAT_CONTENT_RETENTION_DAYS;
    const defaultReport = await retention.runMediaMaintenance(now);
    assert.equal(defaultReport.mediaExpired, 0); assert.equal(defaultReport.contentExpired, 0);
    assert(fs.existsSync(media.chatMediaPath(uploaded)), 'Referenced media is kept by default');
    assert(!fs.existsSync(path.join(assets, assetOrphan))); assert(fs.existsSync(path.join(assets, libraryFile)));
    process.env.CHAT_MEDIA_RETENTION_DAYS = '30'; process.env.CHAT_CONTENT_RETENTION_DAYS = '60';
    const report = await retention.runMediaMaintenance(now);
    assert.equal(report.mediaExpired, 1); assert.equal(report.contentExpired, 1); assert.equal(report.chatOrphansRemoved, 1);
    assert.equal(rows[0].text, ''); assert.equal(rows[0].mediaPath, null); assert.equal(rows[0].id, 'expired'); assert(previewCleared);
    assert.equal(rows[1].text, 'pending'); assert(fs.existsSync(path.join(chat, protectedFile)));
    assert(fs.existsSync(path.join(chat, recentFile)), 'Recent in-flight files survive orphan cleanup');
    assert(fs.existsSync(path.join(chat, 'unrelated.txt')));
    // Running again is idempotent and does not remove the protected files.
    assert.deepEqual(await retention.runMediaMaintenance(now), { mediaExpired: 0, contentExpired: 0, chatOrphansRemoved: 0, assetOrphansRemoved: 0 });
  } finally {
    if (previousMedia === undefined) delete process.env.CHAT_MEDIA_RETENTION_DAYS; else process.env.CHAT_MEDIA_RETENTION_DAYS = previousMedia;
    if (previousContent === undefined) delete process.env.CHAT_CONTENT_RETENTION_DAYS; else process.env.CHAT_CONTENT_RETENTION_DAYS = previousContent;
    for (const folder of [chat, assets]) { for (const name of await fsp.readdir(folder)) await fsp.unlink(path.join(folder, name)); await fsp.rmdir(folder); }
    await fsp.rmdir(dir);
  }
  console.log('INBOUND_MEDIA_RETENTION_OK');
})().catch(error => { console.error(error); process.exit(1); });

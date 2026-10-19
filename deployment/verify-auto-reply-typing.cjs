const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');

const source = ts.transpileModule(fs.readFileSync('src/server/campaigns/autoReply.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
}).outputText;
const item = { id: 1, reply_status: 'active', type: 'text', reply: { text: 'Balasan' }, reply_when: 'All', delaySeconds: 0 };
const phone = { id: 'phone', userId: 'owner', autoReplyEnabled: true, showTyping: false };
const messages = [{ key: { remoteJid: 'customer@s.whatsapp.net' } }];

async function run(options = {}) {
  const events = [];
  let checks = 0;
  const prisma = { autoReply: {
    findFirst: async () => {
      checks++;
      return options.disabled || (options.cancel && checks > 1) ? null : { id: 1, phone: { showTyping: options.typing ?? true } };
    },
    updateMany: async args => { events.push(['count', args.data.sentCount.increment]); return { count: 1 }; },
  } };
  const socket = {
    sendPresenceUpdate: async (state, jid) => {
      events.push([state, jid]);
      if (options.presenceFails) throw new Error('PRESENCE_FAILED');
    },
    sendMessage: async (jid, content, settings) => {
      events.push(['send', jid, content, settings]);
      if (options.sendFails) throw new Error('SEND_FAILED');
      return options.noId ? undefined : { key: { id: 'reply-id' } };
    },
  };
  const stubs = {
    '../../lib/prisma': { prisma },
    './content': { payloadContent: value => value },
    '../dispatch/media': { loadDispatchImage: async () => Buffer.from('image') },
  };
  const mod = { exports: {} };
  new Function('require', 'module', 'exports', 'setTimeout', source)(
    name => stubs[name] ?? require(name), mod, mod.exports,
    (callback, ms) => { events.push(['wait', ms]); callback(); },
  );
  let error;
  try {
    await mod.exports.sendAutoReply({ ...item, ...options.item }, { ...phone, ...options.phone }, socket, options.messages ?? messages);
  } catch (caught) { error = caught; }
  return { events, error, checks };
}

(async () => {
  let result = await run();
  assert.deepEqual(result.events.map(e => e[0]), ['composing', 'wait', 'send', 'paused', 'count']);
  assert.equal(result.events[1][1], 1500);
  assert.equal(result.checks, 2);
  for (const event of result.events.filter(e => ['composing', 'send', 'paused'].includes(e[0]))) assert.equal(event[1], messages[0].key.remoteJid);
  // The fresh device setting wins over the event's stale phone snapshot.
  result = await run({ typing: false, phone: { showTyping: true } });
  assert.deepEqual(result.events.map(e => e[0]), ['send', 'count']);
  for (const options of [{ disabled: true }, { phone: { autoReplyEnabled: false } }, { item: { reply_status: 'inactive' } }, { item: { reply_when: 'Group' } }]) {
    assert.deepEqual((await run(options)).events, []);
  }
  result = await run({ cancel: true });
  assert.deepEqual(result.events.map(e => e[0]), ['composing', 'wait', 'paused']);
  result = await run({ sendFails: true });
  assert.equal(result.error.message, 'SEND_FAILED');
  assert.equal(result.events.at(-1)[0], 'paused');
  result = await run({ presenceFails: true });
  assert.equal(result.error, undefined);
  assert.equal(result.events.at(-1)[0], 'count');
  result = await run({ sendFails: true, presenceFails: true });
  assert.equal(result.error.message, 'SEND_FAILED');
  assert.equal(result.events.at(-1)[0], 'paused');
  result = await run({ noId: true });
  assert.equal(result.events.at(-1)[0], 'paused');
  result = await run({ item: { is_quoted: true, delaySeconds: 3 } });
  assert.equal(result.events[0][1], 3000);
  assert.deepEqual(result.events.find(e => e[0] === 'send')[3], { quoted: messages[0] });
  const group = [{ key: { remoteJid: 'group@g.us' } }];
  result = await run({ messages: group, item: { reply_when: 'Group' } });
  assert.equal(result.events[0][1], 'group@g.us');
  for (const variant of [
    { type: 'button', reply: { text: 'Pilih', buttons: [] } },
    { type: 'list', reply: { text: 'Daftar' } },
    { type: 'image', reply: { image: { url: 'https://example.test/image.png' }, caption: 'Foto' } },
  ]) {
    result = await run({ item: variant });
    assert.equal(result.error, undefined);
    assert.deepEqual(result.events.map(e => e[0]), ['composing', 'wait', 'send', 'paused', 'count']);
  }
  console.log('AUTO_REPLY_TYPING_OK: fresh device option, visible typing window, cleanup, failure handling, cancellation, quoted/group/media replies, counters');
})().catch(error => { console.error(error); process.exitCode = 1; });

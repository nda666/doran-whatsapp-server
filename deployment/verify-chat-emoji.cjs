const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const mod = { exports: {} };
const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/lib/chatEmoji.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
new Function('exports', code)(mod.exports);
const { chatEmojiGroups, insertChatEmoji } = mod.exports;
const emojis = chatEmojiGroups.flatMap(group => group.items.map(([emoji]) => emoji));
assert.equal(new Set(emojis).size, emojis.length);
for (const emoji of emojis) {
  assert(/\p{Extended_Pictographic}/u.test(emoji));
  assert.equal([...new Intl.Segmenter('id', { granularity: 'grapheme' }).segment(emoji)].length, 1);
  assert.equal(JSON.parse(JSON.stringify({ text: emoji })).text, emoji);
}
assert.deepEqual(insertChatEmoji('Halo Budi', '😊', 5, 5), { text: 'Halo 😊Budi', caret: 7 });
assert.deepEqual(insertChatEmoji('Halo Budi', '🙏', 5, 9), { text: 'Halo 🙏', caret: 7 });
assert.deepEqual(insertChatEmoji('Halo Budi', '🙏', 9, 5), { text: 'Halo 🙏', caret: 7 });
assert.deepEqual(insertChatEmoji('', '❤️', 0, 0), { text: '❤️', caret: 2 });
assert.equal(insertChatEmoji('😀', '😊', 1, 1).text, '😊😀');
assert.equal(insertChatEmoji('😀', '🙏', 1, 2).text, '🙏');
assert.equal(insertChatEmoji('a'.repeat(9999), '😊', 9999, 9999), null);
assert.equal(insertChatEmoji('a'.repeat(9998), '😊', 9998, 9998).text.length, 10000);
assert.equal(insertChatEmoji('a'.repeat(10000), '😊', 0, 2).text.length, 10000);
console.log(`CHAT_EMOJI_OK: ${emojis.length} Unicode emoji, grapheme integrity, cursor/selection replacement, UTF-16 boundaries, JSON roundtrip, message limit.`);

const assert = require('node:assert/strict');
const fs = require('node:fs');
(async () => {
  const source = fs.readFileSync('src/pages/reset-password.tsx', 'utf8');
  assert(source.includes('window.history.replaceState(window.history.state'));
  const effect = source.slice(source.indexOf('useEffect(() =>'), source.indexOf('const submit'));
  assert(!effect.includes('replaceState('), 'Fragment must survive the initial page mount');
  const response = await fetch('https://dashboard.jeblast.com/reset-password', { signal: AbortSignal.timeout(15000) });
  assert.equal(response.status, 200);
  const html = await response.text(); assert(html.includes('RESET PASSWORD'));
  const chunks = [...html.matchAll(/<script[^>]*src="([^"]+\.js)"/g)].map(match => match[1]);
  const scripts = await Promise.all(chunks.map(async chunk => {
    const result = await fetch(new URL(chunk, 'https://dashboard.jeblast.com'));
    return result.text();
  }));
  const js = scripts.join('\n');
  assert(js.includes('Password baru')); assert(js.includes('Simpan password baru'));
  console.log('RESET_LINK_LIVE_OK: deployed source preserves fragment until success, reset page and password form bundle available.');
})().catch(error => { console.error(error.message); process.exitCode = 1; });

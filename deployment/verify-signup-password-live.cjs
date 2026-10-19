const assert = require('node:assert/strict');
(async () => {
  for (const base of ['http://127.0.0.1:3000', 'https://dashboard.jeblast.com']) {
    const page = await fetch(base + '/signup', { signal: AbortSignal.timeout(25000) });
    assert.equal(page.status, 200);
    const html = await page.text();
    assert(html.includes('Akun baru perlu persetujuan admin'));
    const signup = html.match(/src="([^"]*pages\/signup-[^"]+\.js)"/);
    assert(signup, 'Signup browser bundle missing');
    const bundle = await fetch(base + signup[1], { signal: AbortSignal.timeout(25000) });
    assert.equal(bundle.status, 200);
    const js = await bundle.text();
    assert(js.includes('validation.min'));
    assert(/min:6\b/.test(js));
    const send = password => fetch(base + '/api/signup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Validation', email: 'admin@gmail.com', password, passwordConfirm: password }), signal: AbortSignal.timeout(25000) });
    const short = await send('12345');
    assert.equal(short.status, 400);
    assert((await short.json()).message.includes('minimal 6 karakter'));
    const six = await send('123456');
    assert.equal(six.status, 409);
    assert.equal((await six.json()).message, 'Email ini khusus untuk akun administrator.');
    console.log('LIVE_SIGNUP_PASSWORD_PASSED', base);
  }
})().catch(error => { console.error(error); process.exitCode = 1; });

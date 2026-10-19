/* Browser checks against a local build. All API requests use in-memory fixtures. */
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { chromium } = require(process.env.DORAN_PLAYWRIGHT_MODULE || 'playwright');
const { encode } = require('next-auth/jwt');
const base = 'http://127.0.0.1:3107';
(async () => {
  let server;
  if (process.env.DORAN_UI_START_SERVER) {
    const { spawn } = require('node:child_process');
    server = spawn(process.execPath, [require.resolve('next/dist/bin/next'), 'dev', '--port', '3107', '--hostname', '127.0.0.1'], {
      cwd: path.resolve(process.env.DORAN_UI_START_SERVER), windowsHide: true,
      env: { ...process.env, NEXTAUTH_URL: base, NEXTAUTH_SECRET: 'local-build-check-only', DATABASE_URL: 'mysql://build_check:unused@127.0.0.1:3306/build_check' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    process.on('exit', () => server?.kill());
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Local test server did not start')), 30000);
      server.stdout.on('data', data => { if (data.toString().includes('Ready')) { clearTimeout(timeout); resolve(); } });
      server.on('exit', code => { clearTimeout(timeout); reject(new Error('Local server exited: ' + code)); });
      server.on('error', reject);
    });
  }
  const browser = await chromium.launch({ executablePath: process.env.DORAN_CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const token = await encode({ secret: 'local-build-check-only', token: { id: 'owner', email: 'fixture@example.test' }, maxAge: 3600 });
  await context.addCookies([{ name: 'next-auth.session-token', value: token, url: base }]);
  const page = await context.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const phone = { id: 'phone-1', name: 'Perangkat Uji', number: '6281234567890', active: 1, isOnline: true, saveIncomingMessages: true };
  const conversation = { id: 'chat-1', phoneId: phone.id, name: 'Budi', jid: '628000000000@s.whatsapp.net', lastMessage: 'Apakah pesanan saya sudah siap?', lastMessageAt: new Date().toISOString(), unreadCount: 0, archived: false };
  const rows = [{ id: 'message-1', direction: 'IN', type: 'text', text: conversation.lastMessage, status: 'RECEIVED', createdAt: conversation.lastMessageAt, mediaUrl: null }];
  let sends = 0;
  await context.route('**/socket.io/**', route => route.abort());
  await context.route('**/api/**', route => {
    const url = new URL(route.request().url()), endpoint = url.pathname;
    let data = {};
    if (endpoint === '/api/auth/session') data = { user: { id: 'owner', token: 'fixture-token', name: 'Pengguna Uji', email: 'fixture@example.test', isActive: true, role: 'USER', approvalStatus: 'APPROVED' }, expires: '2099-01-01T00:00:00Z' };
    else if (endpoint === '/api/phones') data = [phone];
    else if (endpoint === '/api/conversations') data = { data: [conversation], total: 1 };
    else if (endpoint === '/api/conversations/chat-1') data = { data: rows, conversation, hasMore: false };
    else if (endpoint === '/api/message-templates') data = { data: [{ id: 'template-1', name: 'Pesanan siap', content: 'Halo {nama}, pesanan Anda sudah siap.' }], total: 1 };
    else if (endpoint.endsWith('/send')) sends++;
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) });
  });
  const output = path.resolve(__dirname, '../output/chat-composer-menu'); fs.mkdirSync(output, { recursive: true });
  try {
    await page.goto(base + '/dashboard/conversations', { timeout: 90000 });
    // The local Next dev toolbar floats over the mobile composer; it is absent in production.
    await page.addStyleTag({ content: 'nextjs-portal { display: none !important; }' });
    await page.getByRole('button').filter({ hasText: 'Budi' }).click();
    const add = page.getByRole('button', { name: 'Tambah ke pesan', exact: true });
    await add.click();
    for (const label of ['Foto & video', 'Dokumen', 'Audio', 'Template pesan']) await page.getByRole('menuitem', { name: new RegExp(label + '$') }).waitFor();
    await page.screenshot({ path: path.join(output, 'desktop-menu.png'), fullPage: true });
    await page.getByRole('menuitem', { name: /Template pesan$/ }).click();
    const picker = page.getByRole('dialog', { name: 'Pilih template pesan', exact: true });
    await picker.getByRole('combobox').click(); await page.getByTitle('Pesanan siap', { exact: true }).click();
    await picker.getByRole('button', { name: 'Gunakan pesan', exact: true }).click();
    await picker.waitFor({ state: 'hidden' });
    assert.equal(await page.getByRole('textbox', { name: 'Tulis balasan' }).inputValue(), 'Halo Budi, pesanan Anda sudah siap.');
    assert.equal(await page.getByRole('button', { name: 'Pilih template pesan', exact: true }).count(), 0);
    await page.screenshot({ path: path.join(output, 'desktop-composer.png'), fullPage: true });
    for (const [label, accept] of [['Foto & video', 'image/jpeg'], ['Dokumen', '.pdf'], ['Audio', 'audio/mpeg']]) {
      await add.click();
      const chooser = page.waitForEvent('filechooser');
      await page.getByRole('menuitem', { name: new RegExp(label + '$') }).click();
      await chooser;
      assert((await page.locator('input[type=file]').getAttribute('accept')).includes(accept));
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole('button', { name: 'Buka menu', exact: true }).waitFor();
    await page.waitForFunction(() => document.querySelector('.ant-layout-sider')?.getBoundingClientRect().width <= 1);
    await add.click();
    await page.getByRole('menuitem', { name: /Template pesan$/ }).waitFor();
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({ path: path.join(output, 'mobile-menu.png'), fullPage: true });
    await page.keyboard.press('Escape');
    const addBounds = await add.boundingBox(), textBounds = await page.getByRole('textbox', { name: 'Tulis balasan' }).boundingBox();
    assert(Math.abs((addBounds.y + addBounds.height) - (textBounds.y + textBounds.height)) < 3, 'Composer controls must share one row');
    phone.isOnline = false;
    await page.waitForFunction(() => document.querySelector('button[aria-label="Tambah ke pesan"]')?.disabled, { timeout: 15000 });
    assert.equal(sends, 0); assert.deepEqual(errors, []);
    console.log('PASS: single-row composer; plus menu; personalized template selection; media file filters; mobile fit; offline disabled; no sends.');
  } catch (error) { await page.screenshot({ path: path.join(output, 'failure.png'), fullPage: true }); throw error; }
  finally { await browser.close(); server?.kill(); }
})().catch(error => { console.error(error); process.exitCode = 1; });

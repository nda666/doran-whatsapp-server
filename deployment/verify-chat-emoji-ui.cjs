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
    else if (endpoint.endsWith('/send')) { sends++; const payload = route.request().postDataJSON(); data = { id: 'out-1', direction: 'OUT', type: 'text', text: payload.text, status: 'SENT', createdAt: new Date().toISOString() }; rows.push(data); }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) });
  });
  const output = path.resolve(__dirname, '../output/chat-emoji'); fs.mkdirSync(output, { recursive: true });
  try {
    await page.goto(base + '/dashboard/conversations', { timeout: 90000 });
    await page.addStyleTag({ content: 'nextjs-portal { display: none !important; }' });
    await page.getByRole('button').filter({ hasText: 'Budi' }).click();
    const input = page.getByRole('textbox', { name: 'Tulis balasan', exact: true });
    const pickerButton = page.getByRole('button', { name: 'Sisipkan emoji', exact: true });
    await input.fill('Halo Budi');
    await input.evaluate(element => { element.focus(); element.setSelectionRange(5, 5); element.dispatchEvent(new Event('select', { bubbles: true })); });
    await pickerButton.click();
    let picker = page.getByRole('region', { name: 'Pilihan emoji', exact: true });
    await picker.getByRole('button', { name: /^😊 / }).click();
    assert.equal(await input.inputValue(), 'Halo 😊Budi');
    assert.equal(await input.evaluate(element => element.selectionStart), 7);
    await input.evaluate(element => { element.focus(); element.setSelectionRange(5, 7); element.dispatchEvent(new Event('select', { bubbles: true })); });
    await pickerButton.click();
    await picker.getByRole('searchbox', { name: 'Cari emoji', exact: true }).fill('paket');
    await picker.getByRole('button', { name: /^📦 / }).click();
    assert.equal(await input.inputValue(), 'Halo 📦Budi'); assert.equal(sends, 0);
    await pickerButton.click();
    await picker.getByRole('button', { name: 'Hati', exact: true }).click();
    await page.screenshot({ path: path.join(output, 'desktop-picker.png'), fullPage: true, animations: 'disabled' });
    await picker.getByRole('button', { name: /^❤️ / }).click();
    assert.equal(await input.inputValue(), 'Halo 📦❤️Budi');
    await input.fill('a'.repeat(9999));
    await pickerButton.click(); await picker.getByRole('button', { name: /^😊 / }).click();
    assert.equal((await input.inputValue()).length, 9999);
    await picker.getByRole('button', { name: 'Tutup pilihan emoji', exact: true }).click();
    await input.fill('Terima kasih 😊🙏❤️ 📦');
    await page.getByRole('button', { name: 'Kirim pesan', exact: true }).click();
    await page.getByText('Terima kasih 😊🙏❤️ 📦', { exact: true }).waitFor();
    assert.equal(sends, 1); assert.equal(rows.at(-1).text, 'Terima kasih 😊🙏❤️ 📦');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole('button', { name: 'Buka menu', exact: true }).waitFor();
    await page.waitForFunction(() => document.querySelector('.ant-layout-sider')?.getBoundingClientRect().width <= 1);
    await pickerButton.click();
    await picker.getByRole('searchbox', { name: 'Cari emoji', exact: true }).fill('tidak-ada-emoji-ini');
    await picker.getByText('Emoji tidak ditemukan. Coba kata lain.', { exact: true }).waitFor();
    await picker.getByRole('searchbox', { name: 'Cari emoji', exact: true }).fill('');
    await page.waitForFunction(() => {
      const popover = [...document.querySelectorAll('.ant-popover')].find(node => node.getBoundingClientRect().height > 0);
      const rect = popover?.getBoundingClientRect();
      return rect && rect.left >= 0 && rect.right <= innerWidth;
    });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({ path: path.join(output, 'mobile-picker.png'), fullPage: true, animations: 'disabled' });
    await picker.getByRole('button', { name: 'Tutup pilihan emoji', exact: true }).click();
    phone.isOnline = false;
    await page.waitForFunction(() => document.querySelector('button[aria-label="Sisipkan emoji"]')?.disabled);
    // A disabled composer must keep the same controls and row as the active one.
    for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
      await page.setViewportSize(viewport);
      for (const state of ['storage-disabled', 'offline']) {
        phone.isOnline = state === 'storage-disabled';
        phone.saveIncomingMessages = state !== 'storage-disabled';
        await page.reload();
        await page.addStyleTag({ content: 'nextjs-portal { display: none !important; }' });
        await page.getByRole('button').filter({ hasText: 'Budi' }).click();
        await page.getByText(state === 'storage-disabled'
          ? 'Penyimpanan pesan pada perangkat ini nonaktif. Aktifkan untuk membalas.'
          : 'Perangkat belum terhubung. Hubungkan melalui menu Perangkat HP untuk membalas.', { exact: true }).waitFor();
        const controls = [page.getByRole('button', { name: 'Tambah ke pesan', exact: true }), pickerButton, input,
          page.getByRole('button', { name: 'Kirim pesan', exact: true })];
        const boxes = [];
        for (const control of controls) {
          assert(await control.isVisible()); assert(await control.isDisabled());
          boxes.push(await control.boundingBox());
        }
        assert.equal(await page.getByRole('button', { name: 'Pilih template pesan', exact: true }).count(), 0);
        assert(boxes.every(box => Math.abs((box.y + box.height) - (boxes[0].y + boxes[0].height)) < 3), 'Disabled composer must remain in one row');
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
        await page.screenshot({ path: path.join(output, `${state}-${viewport.width}.png`), fullPage: true, animations: 'disabled' });
      }
    }
    assert.deepEqual(errors, []);
    console.log('PASS: native emoji at cursor/selection; search/categories; heart sequence; length guard; unchanged Unicode in mock send; mobile fit; storage disabled and offline retain new composer on desktop/mobile. No actual WhatsApp messages sent.');
  } catch (error) { await page.screenshot({ path: path.join(output, 'failure.png'), fullPage: true }); throw error; }
  finally { await browser.close(); server?.kill(); }
})().catch(error => { console.error(error); process.exitCode = 1; });

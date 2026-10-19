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
    server = spawn(process.execPath, [require.resolve('next/dist/bin/next'), 'start', '--port', '3107', '--hostname', '127.0.0.1'], {
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
  const templates = [], configs = [], rules = [], errors = [];
  const phone = { id: 'phone-1', name: 'Perangkat Uji', number: '6281234567890', active: 1, isOnline: true, autoReplyEnabled: true };
  let savedAiRule, tested = 0;
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  await context.route('**/socket.io/**', route => route.abort());
  await context.route('**/api/**', async route => {
    const req = route.request(), url = new URL(req.url()), endpoint = url.pathname;
    let data;
    if (endpoint === '/api/auth/session') data = { user: { id: 'owner', name: 'Pengguna Uji', email: 'fixture@example.test', token: 'fixture-token', isActive: true, role: 'USER', approvalStatus: 'APPROVED' }, expires: '2099-01-01T00:00:00Z' };
    else if (endpoint === '/api/message-templates') {
      if (req.method() === 'POST') { data = { ...req.postDataJSON(), id: 'template-' + templates.length }; templates.push(data); }
      else data = { data: templates, total: templates.length };
    } else if (endpoint === '/api/ai-plugins') {
      if (req.method() === 'POST') { const body = req.postDataJSON(); assert(body.apiKey.startsWith('fixture-')); data = { ...body, hasKey: true }; delete data.apiKey; configs.push(data); }
      else data = { data: configs, recent: [], encryptionReady: true };
    } else if (endpoint === '/api/ai-plugins/test') { tested++; data = { text: 'Halo, saya siap membantu pelanggan Anda.' }; }
    else if (endpoint === '/api/phones') data = [phone];
    else if (endpoint === '/api/auto_reply') {
      if (req.method() === 'POST') { savedAiRule = req.postDataJSON(); data = { ...savedAiRule, id: 1, type: savedAiRule.type_message, reply: { provider: savedAiRule.aiProvider }, reply_status: 'inactive', sentCount: 0 }; rules.push(data); }
      else data = rules;
    } else if (endpoint === '/api/contacts/groups') data = [];
    else data = { data: [], total: 0 };
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) });
  });
  const output = path.resolve(__dirname, '../output/templates-ai'); fs.mkdirSync(output, { recursive: true });
  try {
    await page.goto(base + '/dashboard/message-templates');
    await page.getByRole('button', { name: 'Buat template', exact: true }).click();
    const editor = page.getByRole('dialog', { name: 'Template baru', exact: true });
    await editor.getByLabel('Nama template').fill('Konfirmasi Pesanan');
    await editor.getByLabel('Isi pesan', { exact: true }).fill('Halo {nama}, pesanan {produk} siap.');
    await editor.getByRole('button', { name: 'Simpan', exact: true }).click();
    await page.getByRole('cell', { name: 'Konfirmasi Pesanan', exact: true }).waitFor();
    assert.equal(templates.length, 1);
    await page.screenshot({ path: path.join(output, 'templates-desktop.png'), fullPage: true });

    await page.goto(base + '/dashboard/campaigns');
    await page.getByRole('button', { name: 'Buat Campaign', exact: true }).click();
    await page.getByRole('button', { name: 'Pilih template pesan', exact: true }).click();
    const picker = page.getByRole('dialog', { name: 'Pilih template pesan', exact: true });
    await picker.getByRole('combobox').click();
    await page.getByTitle('Konfirmasi Pesanan', { exact: true }).click();
    await picker.getByRole('textbox').last().fill('Keyboard');
    await picker.getByRole('button', { name: 'Gunakan pesan' }).click();
    assert.equal(await page.getByLabel('Pesan / caption', { exact: true }).inputValue(), 'Halo {nama}, pesanan Keyboard siap.');
    await page.screenshot({ path: path.join(output, 'campaign-template.png'), fullPage: true });

    await page.goto(base + '/dashboard/ai-plugins');
    for (const [provider, label] of [['openai', 'OpenAI'], ['gemini', 'Gemini AI'], ['claude', 'Claude AI']]) {
      await page.getByRole('button', { name: 'Atur ' + label, exact: true }).click();
      await page.getByLabel('API key', { exact: true }).fill('fixture-' + provider + '-key');
      await page.getByLabel('ID model', { exact: true }).fill('fixture-model');
      await page.getByText('Aktifkan plugin ini', { exact: true }).click();
      await page.getByRole('button', { name: 'Simpan pengaturan', exact: true }).click();
      await page.getByRole('button', { name: 'Uji koneksi & balasan', exact: true }).waitFor({ state: 'visible' });
      await page.waitForFunction(() => [...document.querySelectorAll('button')].some(button => button.textContent.includes('Uji koneksi') && !button.disabled));
      assert(configs.some(config => config.provider === provider && config.enabled));
    }
    await page.getByRole('button', { name: 'Uji koneksi & balasan', exact: true }).click();
    const testModal = page.getByRole('dialog', { name: 'Uji Claude AI', exact: true });
    await testModal.getByRole('button', { name: 'Uji balasan', exact: true }).click();
    await testModal.getByText('Halo, saya siap membantu pelanggan Anda.', { exact: true }).waitFor();
    assert.equal(tested, 1);
    await page.screenshot({ path: path.join(output, 'ai-provider-test.png'), fullPage: true });
    await testModal.getByRole('button', { name: 'Tutup', exact: true }).click();

    await page.goto(base + '/dashboard/auto-reply?phone_id=phone-1');
    await page.getByRole('button', { name: 'Tambah Balasan', exact: true }).click();
    const rule = page.getByRole('dialog', { name: 'Tambah Balasan Otomatis', exact: true });
    await rule.getByText('Cocok dengan segalanya', { exact: true }).click();
    await rule.getByLabel('Jenis pesan balasan', { exact: true }).press('ArrowDown');
    await page.getByTitle('Balasan AI (OpenAI / Gemini / Claude)', { exact: true }).click();
    await rule.getByLabel('Provider AI', { exact: true }).press('ArrowDown');
    await page.getByTitle('Gemini AI', { exact: true }).click();
    await rule.getByLabel('Instruksi tambahan untuk aturan ini (opsional)').fill('Bantu pelanggan memilih produk.');
    await page.screenshot({ path: path.join(output, 'ai-auto-reply.png'), fullPage: true });
    await rule.getByRole('button', { name: 'Simpan', exact: true }).click();
    await rule.waitFor({ state: 'hidden' });
    assert.equal(savedAiRule.type_message, 'ai'); assert.equal(savedAiRule.aiProvider, 'gemini'); assert.equal(savedAiRule.reply_when, 'Personal');

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(base + '/dashboard/message-templates');
    await page.getByRole('button', { name: 'Buat template', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Buka menu', exact: true }).waitFor();
    await page.waitForFunction(() => document.querySelector('.ant-layout-sider')?.getBoundingClientRect().width <= 1);
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'Template page must fit mobile width');
    await page.screenshot({ path: path.join(output, 'templates-mobile.png'), fullPage: true });
    await page.goto(base + '/dashboard/ai-plugins');
    await page.getByRole('button', { name: 'Atur OpenAI', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Buka menu', exact: true }).waitFor();
    await page.waitForFunction(() => document.querySelector('.ant-layout-sider')?.getBoundingClientRect().width <= 1);
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'AI page must fit mobile width');
    await page.screenshot({ path: path.join(output, 'ai-mobile.png'), fullPage: true });
    assert.deepEqual(errors, []);
    console.log('PASS: browser template create/picker/campaign variables; configure all three providers; mock AI test; save AI auto-reply; desktop/mobile renders. Screenshots: output/templates-ai. No real API or WhatsApp requests.');
  } catch (error) {
    await page.screenshot({ path: path.join(output, 'failure.png'), fullPage: true });
    console.error('PAGE_ERRORS', JSON.stringify(errors)); throw error;
  } finally { await browser.close(); server?.kill(); }
})().catch(error => { console.error(error); process.exitCode = 1; });

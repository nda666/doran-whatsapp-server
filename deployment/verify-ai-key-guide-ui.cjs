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
  await context.route('**/socket.io/**', route => route.abort());
  await context.route('**/api/**', route => {
    const endpoint = new URL(route.request().url()).pathname;
    assert.equal(route.request().method(), 'GET', 'Guide inspection must not save settings or invoke AI');
    const data = endpoint === '/api/auth/session'
      ? { user: { id: 'owner', token: 'fixture-token', name: 'Pengguna Uji', email: 'fixture@example.test', isActive: true, role: 'USER', approvalStatus: 'APPROVED' }, expires: '2099-01-01T00:00:00Z' }
      : { data: [], recent: [], encryptionReady: true };
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) });
  });
  const output = path.resolve(__dirname, '../output/ai-key-guide'); fs.mkdirSync(output, { recursive: true });
  try {
    await page.goto(base + '/dashboard/ai-plugins', { timeout: 90000 });
    await page.addStyleTag({ content: 'nextjs-portal { display: none !important; }' });
    for (const [provider, label, portal] of [
      ['openai', 'OpenAI', 'https://platform.openai.com/api-keys'],
      ['gemini', 'Gemini AI', 'https://aistudio.google.com/api-keys'],
      ['claude', 'Claude AI', 'https://platform.claude.com/settings/keys'],
    ]) {
      await page.getByRole('button', { name: 'Atur ' + label, exact: true }).click();
      const guide = page.getByRole('region', { name: 'Panduan API key ' + label, exact: true });
      await guide.getByText('1. Cara mendapatkan API key ' + label, { exact: true }).waitFor();
      const portalLink = guide.getByRole('link', { name: /Buka API key di/ });
      assert.equal(await portalLink.getAttribute('href'), portal);
      assert.equal(await portalLink.getAttribute('target'), '_blank');
      await guide.getByText('2. Isi pengaturan di Doran WA dan uji balasan', { exact: true }).click();
      await guide.getByRole('link', { name: 'daftar model resmi ' + label, exact: true }).waitFor();
      await guide.getByText('3. Jika key atau uji balasan belum berhasil', { exact: true }).click();
      await guide.getByText('Perlakukan API key seperti kata sandi', { exact: true }).waitFor();
      assert((await guide.innerText()).includes('bukan batas tagihan dalam rupiah'));
      assert((await guide.innerText()).includes('00.00 WIB'));
      const links = await guide.getByRole('link').evaluateAll(nodes => nodes.map(node => ({ href: node.href, rel: node.rel })));
      assert(links.every(link => link.href.startsWith('https://') && link.rel.includes('noopener')));
      await guide.screenshot({ path: path.join(output, provider + '-desktop.png'), animations: 'disabled' });
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole('button', { name: 'Buka menu', exact: true }).waitFor();
    await page.waitForFunction(() => document.querySelector('.ant-layout-sider')?.getBoundingClientRect().width <= 1);
    await page.getByRole('button', { name: 'Atur Gemini AI', exact: true }).click();
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.getByRole('region', { name: 'Panduan API key Gemini AI', exact: true }).screenshot({ path: path.join(output, 'gemini-mobile.png'), animations: 'disabled' });
    assert.deepEqual(errors, []);
    console.log('PASS: all three beginner guides, official key/model/billing links, expandable setup/troubleshooting, mobile width; read-only fixture API, no paid calls.');
  } catch (error) { await page.screenshot({ path: path.join(output, 'failure.png'), fullPage: true }); throw error; }
  finally { await browser.close(); server?.kill(); }
})().catch(error => { console.error(error); process.exitCode = 1; });

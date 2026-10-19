const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const app = '/home/jeblast/repos/doran-whatsapp-server';
process.env.PATH = '/home/jeblast/.local/share/doran-node/node-v24.21.0-linux-x64/bin:' + process.env.PATH;
const incoming = '/home/jeblast/webhook-cashier-incoming-20261011';
const sourcePath = 'src/server/utils/sendDeviceWebhook.ts';
const compiledPath = 'dist/src/server/utils/sendDeviceWebhook.js';
const testPath = 'deployment/verify-device-webhook.cjs';
const docsPath = 'deployment/device-webhook-api.md';
const nextSource = fs.readFileSync(path.join(incoming, 'sendDeviceWebhook.ts'), 'utf8');
const oldSource = fs.readFileSync(path.join(app, sourcePath), 'utf8');
const normalize = text => text.replace(/\r\n/g, '\n');
assert.equal(normalize(oldSource), normalize(nextSource.replace(', "Accept": "application/json"', '')), 'Unexpected live source changes');
const ts = require(path.join(app, 'node_modules/typescript'));
const compiled = ts.transpileModule(nextSource, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true }, reportDiagnostics: true });
assert(!compiled.diagnostics.some(d => d.category === ts.DiagnosticCategory.Error));
const pm2 = args => execFileSync('/usr/local/bin/pm2', args, { cwd: app, encoding: 'utf8' });
const processes = () => JSON.parse(pm2(['jlist']));
const before = processes();
const telegramPid = before.find(p => p.name === 'telegram-sender')?.pid;
const backup = '/home/jeblast/backups/doran-webhook-cashier-20261011-' + Date.now();
fs.mkdirSync(backup, { recursive: true, mode: 0o700 });
const changes = new Map([[sourcePath, nextSource], [compiledPath, compiled.outputText], [testPath, fs.readFileSync(path.join(incoming, 'verify-device-webhook.cjs'))], [docsPath, fs.readFileSync(path.join(incoming, 'device-webhook-api.md'))]]);
for (const file of changes.keys()) {
  const dest = path.join(backup, file);
  fs.mkdirSync(path.dirname(dest), { recursive: true, mode: 0o700 });
  if (fs.existsSync(path.join(app, file))) fs.copyFileSync(path.join(app, file), dest);
}
let restarted = false;
(async () => {
  try {
    for (const [file, content] of changes) fs.writeFileSync(path.join(app, file), content);
    execFileSync('node', ['--check', compiledPath], { cwd: app });
    process.stdout.write(execFileSync('node', [testPath], { cwd: app, encoding: 'utf8' }));
    restarted = true;
    pm2(['restart', 'doran-whatsapp']);
    let ready = false;
    for (let attempt = 0; attempt < 40; attempt++) {
      try { if ((await fetch('http://127.0.0.1:3000/signin', {signal: AbortSignal.timeout(3000)})).status === 200) { ready = true; break; } } catch {}
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    assert(ready, 'Dashboard startup failed');
    const after = processes();
    assert.equal(after.find(p => p.name === 'telegram-sender')?.pid, telegramPid);
    assert.equal(after.find(p => p.name === 'doran-whatsapp').pm2_env.status, 'online');
    assert(fs.readFileSync(path.join(app, compiledPath), 'utf8').includes('"Accept": "application/json"'));
    console.log('CASHIER_WEBHOOK_HEADER_DEPLOYED', backup);
  } catch (error) {
    for (const file of changes.keys()) {
      const old = path.join(backup, file);
      if (fs.existsSync(old)) fs.copyFileSync(old, path.join(app, file));
    }
    if (restarted) pm2(['restart', 'doran-whatsapp']);
    throw error;
  }
})().catch(error => { console.error(error.message); process.exitCode = 1; });

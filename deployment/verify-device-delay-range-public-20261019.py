"""Read-only checks of the deployed authenticated page and its public assets."""
from pathlib import Path
import subprocess
import sys

sys.stdout.reconfigure(encoding='utf-8')
remote = r"""
const assert = require('node:assert/strict');
const fs = require('node:fs');
const app = '/home/jeblast/repos/doran-whatsapp-server';
process.chdir(app);
const req = require('node:module').createRequire(app + '/package.json');
(async () => {
 const base = 'https://dashboard.jeblast.com';
 const build = fs.readFileSync(app + '/.next/BUILD_ID','utf8').trim();
 assert.equal(build,'b-GiVoJWNtGmMB6dJ0xMF');
 const response = await fetch(base + '/signin');
 assert.equal(response.status,200);
 const html = await response.text();
 assert(html.includes('"buildId":"' + build + '"'),'Public build mismatch');
 const manifest = JSON.parse(fs.readFileSync(app + '/.next/build-manifest.json','utf8'));
 const chunks = manifest.pages['/dashboard/phone'].filter(name => name.endsWith('.js'));
 let source = '';
 for (const name of chunks) {
  const asset = await fetch(base + '/_next/' + name);
  assert.equal(asset.status,200);
  source += await asset.text();
 }
 for (const text of ['maxIntervalSeconds','Mulai (detik)','Hingga (detik)']) assert(source.includes(text),'Missing field: ' + text);
 console.log('PUBLIC_DEPLOY_VERIFIED: new build and Mulai-Hingga assets served over HTTPS');
 process.env.DEVICE_DELAY_RANGE_TEST_BASE = base;
 req('./deployment/verify-device-delay-range-live.cjs');
})().catch(error => { console.error(error.message); process.exitCode=1; });
"""
result = subprocess.run(['ssh','-o','BatchMode=yes','-o','ConnectTimeout=15','-i',str(Path.home()/'.ssh/codex_wa_server_ed25519'),'jeblast@103.196.146.186','/home/jeblast/.local/share/doran-node/node-v24.21.0-linux-x64/bin/node','-'], input=remote.encode(), stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
output = result.stdout.decode('utf-8',errors='replace')
print(output, end='')
(Path(__file__).resolve().parent/'device-delay-range-public-verify-20261019.log').write_text(output,encoding='utf-8')
raise SystemExit(result.returncode)

raise SystemExit(result.returncode)

const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
// Transfer the existing token over SSH into process memory only. Never log it.
const contextSource = "require('@next/env').loadEnvConfig(process.cwd());const {PrismaClient}=require('@prisma/client');const p=new PrismaClient();p.phone.findFirst({where:{number:{not:null},user:{approvalStatus:'APPROVED'}},include:{user:true}}).then(async x=>{const admin=x.user.role==='ADMIN'&&x.user.email?.trim().toLowerCase()==='admin@gmail.com';process.stdout.write(JSON.stringify({token:x.token,number:x.number,role:x.user.role,scope:admin?'all':'own',total:await p.phone.count({where:admin?{}:{userId:x.userId}})}));}).finally(()=>p.$disconnect());";
(async () => {
  const context = spawnSync('ssh', ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=10', '-i',
    'C:\\Users\\nanan\\.ssh\\codex_wa_server_ed25519', 'jeblast@103.196.146.186',
    'cd /home/jeblast/repos/doran-whatsapp-server && /home/jeblast/.local/share/doran-node/node-v24.21.0-linux-x64/bin/node'],
    { input: contextSource, encoding: 'utf8' });
  assert.equal(context.status, 0, 'SSH read-only API authentication context unavailable');
  const auth = JSON.parse(context.stdout);
  for (const method of ['GET', 'POST']) for (const action of ['list-phones', 'phone-detail']) {
    const fields = action === 'phone-detail' ? { number: auth.number } : {};
    const response = await fetch('https://dashboard.jeblast.com/api/public/' + action + (method === 'GET' ? '?' + new URLSearchParams(fields) : ''), {
      method, headers: { Authorization: 'Bearer ' + auth.token, ...(method === 'POST' ? { 'Content-Type': 'application/json' } : {}) },
      ...(method === 'POST' ? { body: JSON.stringify(fields) } : {}),
    });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.result, true); assert(body.total > 0);
    assert.deepEqual(body.access, { role: auth.role, scope: auth.scope });
    assert.equal(body.total, body.data.length);
    assert(body.data.every(row => ('token' in row) === (auth.scope === 'all') && !('qrCode' in row)));
    if (auth.scope === 'all') assert(body.data.every(row => typeof row.token === 'string'));
    if (action === 'phone-detail') assert(body.data.every(row => row.number === auth.number));
    if (action === 'list-phones') assert.equal(body.total, auth.total);
    console.log('EXTERNAL_WINDOWS_HTTPS_OK', method, action, 'scope', body.access.scope, 'total', body.total);
  }
})().catch(() => { console.error('External registered phone API verification failed'); process.exitCode = 1; });

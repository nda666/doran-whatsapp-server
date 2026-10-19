const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const contextSource = "require('@next/env').loadEnvConfig(process.cwd());const {PrismaClient}=require('@prisma/client');const p=new PrismaClient();p.user.findUniqueOrThrow({where:{email:'admin@gmail.com'}}).then(async x=>process.stdout.write(JSON.stringify({token:x.token,total:await p.phone.count()}))).finally(()=>p.$disconnect());";
(async () => {
  const context = spawnSync('ssh', ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=10', '-i',
    'C:\\Users\\nanan\\.ssh\\codex_wa_server_ed25519', 'jeblast@103.196.146.186',
    'cd /home/jeblast/repos/doran-whatsapp-server && /home/jeblast/.local/share/doran-node/node-v24.21.0-linux-x64/bin/node'], { input: contextSource, encoding: 'utf8' });
  assert.equal(context.status, 0);
  const auth = JSON.parse(context.stdout);
  const response = await fetch('https://dashboard.jeblast.com/api/phones?page=1&limit=100&sort=user.name&order=asc', { headers: { Authorization: 'Bearer ' + auth.token } });
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.total, auth.total);
  assert(result.data.every(row => row.user.id === row.userId && Object.keys(row.user).sort().join(',') === 'email,id,name'));
  console.log('EXTERNAL_WINDOWS_PHONE_OWNERSHIP_HTTPS_OK', result.total, 'devices; owner id/name/email present');
})().catch(() => { console.error('External phone ownership verification failed'); process.exitCode = 1; });

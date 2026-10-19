from pathlib import Path
import subprocess

remote = r'''
import pathlib,subprocess,os,json,hashlib,zipfile
app=pathlib.Path('/home/jeblast/repos/doran-whatsapp-server')
os.environ['PATH']='/home/jeblast/.local/share/doran-node/node-v24.21.0-linux-x64/bin:'+os.environ['PATH']
with zipfile.ZipFile('/home/jeblast/wa-recovery-20261015.zip') as archive:
 manifest=json.loads(archive.read('manifest.json'))
for name,digest in manifest.items(): assert hashlib.sha256((app/name).read_bytes()).hexdigest()==digest,name
assert '30000' in (app/'dist/src/server/waRecovery.js').read_text()
chunks=list((app/'.next/static/chunks/pages/dashboard').glob('phone-*.js'))
assert chunks and any('scan_qr' in f.read_text() and 'Status sesi belum terverifikasi' in f.read_text() for f in chunks)
print('SOURCE_RUNTIME_AND_BROWSER_BUNDLE_OK',len(manifest))
print('BUILD_ID',(app/'.next/BUILD_ID').read_text().strip())
pm=json.loads(subprocess.check_output(['/usr/local/bin/pm2','jlist'],universal_newlines=True))
for p in pm:
 if p['name'] in ['doran-whatsapp','telegram-sender']:
  print('SERVICE',p['name'],p['pm2_env']['status'],p['pid'])
  assert p['pm2_env']['status']=='online'
js=r"""
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
require('@next/env').loadEnvConfig(process.cwd());
const {PrismaClient}=require('@prisma/client');
const db=new PrismaClient();
async function main(){
 const admin=await db.user.findUniqueOrThrow({where:{email:'admin@gmail.com'}});
 async function get(url,token){
  const r=await fetch('http://127.0.0.1:3000'+url,{headers:token?{Authorization:'Bearer '+token}:{},signal:AbortSignal.timeout(20000)});
  assert.equal(r.status,token?200:401);return r.json();
 }
 await get('/api/phones?page=1&limit=100');
 const all=[];
 for(let page=1;page<=10;page++){
  const response=await get('/api/phones?page='+page+'&limit=100',admin.token);
  all.push(...response.data);if(all.length>=response.total)break;
 }
 assert.equal(all.length,await db.phone.count());
 const counts={};
 for(const row of all){
  const c=row.connection;assert(c?.state&&c.label&&c.description&&c.checkedAt);assert(!('authState' in c));
  counts[c.state]=(counts[c.state]||0)+1;
  if(c.state==='scan_qr'){
   assert.equal(c.qrRequired,true);assert.equal(c.action,'scan_qr');
   let creds;try{creds=JSON.parse(await fs.readFile(path.join('storage/whatsapp-auth',row.userId+'-'+row.id,'creds.json'),'utf8'));}catch(e){assert.equal(e.code,'ENOENT');}
   assert(!creds?.me?.id,'QR status must correspond to missing linked identity');
  }
  if(c.state==='online'){assert.equal(c.qrRequired,false);assert.equal(c.action,'none');assert.equal(row.isOnline,true);}
  if(row.active!==1)assert.equal(c.state,'inactive');
 }
 assert(counts.online>0,'At least one real session must have reconnected');
 console.log('LIVE_CONNECTION_STATES',JSON.stringify(counts));
 for(const row of all.filter(r=>r.name.includes('Nota'))){console.log('NOTA_STATUS',JSON.stringify({name:row.name,state:row.connection.state,qrRequired:row.connection.qrRequired}));}
 const ordinary=await db.user.findFirst({where:{role:'USER',approvalStatus:'APPROVED',isActive:true,phones:{some:{}}}});
 if(ordinary){const result=await get('/api/phones?page=1&limit=100',ordinary.token);assert(result.data.every(p=>p.userId===ordinary.id));console.log('OWNER_SCOPE_OK');}
 console.log('AUTHENTICATED_READ_ONLY_API_CHECKS_OK');
}
main().finally(()=>db.$disconnect()).catch(e=>{console.error(e.message);process.exitCode=1;});
"""
r=subprocess.run(['node','-'],input=js,cwd=app,universal_newlines=True,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
print(r.stdout)
if r.returncode:
 print(r.stderr[-2000:]);raise SystemExit(r.returncode)
print('PUBLIC_SIGNIN_HTTP',subprocess.check_output(['curl','-sS','-o','/dev/null','-w','%{http_code}','https://dashboard.jeblast.com/signin'],universal_newlines=True))
'''
r=subprocess.run(['ssh','-o','BatchMode=yes','-o','ConnectTimeout=15','-i',str(Path.home()/'.ssh/codex_wa_server_ed25519'),'jeblast@103.196.146.186','python3','-'],input=remote,universal_newlines=True,capture_output=True)
print(r.stdout)
if r.returncode: print(r.stderr)
raise SystemExit(r.returncode)

from pathlib import Path
import subprocess

remote = r'''
import os,json,pathlib,subprocess,collections
app=pathlib.Path('/home/jeblast/repos/doran-whatsapp-server')
os.environ['PATH']='/home/jeblast/.local/share/doran-node/node-v24.21.0-linux-x64/bin:'+os.environ['PATH']
js="""require('@next/env').loadEnvConfig(process.cwd()); const {PrismaClient}=require('@prisma/client'); const p=new PrismaClient(); p.phone.findMany({select:{id:true,userId:true,name:true,isOnline:true,active:true,status:true}}).then(rows=>console.log(JSON.stringify(rows))).finally(()=>p.$disconnect());"""
out=subprocess.check_output(['node','-e',js],cwd=app,universal_newlines=True)
rows=json.loads(next(l for l in out.splitlines() if l.startswith('[')))
print('COUNTS',json.dumps(dict(collections.Counter('online' if r['isOnline'] else 'offline_active' if r['active']==1 else 'inactive' for r in rows))))
targets=[r for r in rows if not r['isOnline'] or 'nota' in r['name'].lower()]
for r in targets:
 creds=app/'storage/whatsapp-auth'/f"{r['userId']}-{r['id']}"/'creds.json'
 try: registered=bool(json.loads(creds.read_text()).get('me',{}).get('id'))
 except Exception: registered=False
 print('TARGET',json.dumps({k:v for k,v in r.items() if k!='userId'}), 'AUTH_LINKED',registered)
pm=json.loads(subprocess.check_output(['/usr/local/bin/pm2','jlist'],universal_newlines=True))
proc=next(p for p in pm if p['name']=='doran-whatsapp')
print('APP',proc['pm2_env']['status'],'RESTARTS',proc['pm2_env'].get('restart_time'),'UPTIME',proc['pm2_env'].get('pm_uptime'))
for kind in ['pm_out_log_path','pm_err_log_path']:
 log=pathlib.Path(proc['pm2_env'][kind])
 lines=subprocess.check_output(['tail','-n','1800',str(log)],universal_newlines=True,errors='replace').splitlines()
 relevant=[l for l in lines if ('WA_CONNECTION_STATE' in l and any(r['id'] in l for r in targets)) or any(s in l for s in ['reconnect failed','connection update failed','periodic connection failed','Device connection failed'])]
 print('LOG',kind)
 for l in relevant[-45:]: print(l[:500])
for name in ['src/server/index.ts','src/server/events/connectionUpdate.ts','src/server/libs/makeWASocket.ts']:
 import hashlib
 print('HASH',name,hashlib.sha256((app/name).read_bytes()).hexdigest())
'''
r=subprocess.run(['ssh','-o','BatchMode=yes','-o','ConnectTimeout=15','-i',str(Path.home()/'.ssh/codex_wa_server_ed25519'),'jeblast@103.196.146.186','python3','-'],input=remote,universal_newlines=True,capture_output=True)
print(r.stdout)
if r.returncode: print(r.stderr)
raise SystemExit(r.returncode)




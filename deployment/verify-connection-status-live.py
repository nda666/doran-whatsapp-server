from pathlib import Path
import subprocess
remote = """import subprocess, json, os, pathlib
app=pathlib.Path('/home/jeblast/repos/doran-whatsapp-server')
os.environ['PATH']='/home/jeblast/.local/share/doran-node/node-v24.21.0-linux-x64/bin:'+os.environ['PATH']
js = "require('@next/env').loadEnvConfig(process.cwd()); const {PrismaClient}=require('@prisma/client'); const p=new PrismaClient(); p.phone.findMany({where:{number:'6282324272321'},select:{id:true,number:true,isOnline:true,active:true,showOnline:true}}).then(rows=>console.log(JSON.stringify(rows))).finally(()=>p.$disconnect());"
r=subprocess.run(['node','-e',js],cwd=app,stdout=subprocess.PIPE,stderr=subprocess.PIPE,universal_newlines=True,check=True)
print('TARGET_DEVICE',r.stdout.strip())
print('BUILD_ID',(app/'.next/BUILD_ID').read_text().strip())
pm=json.loads(subprocess.check_output(['/usr/local/bin/pm2','jlist'],cwd=app))
for item in pm:
 if item['name'] in ['doran-whatsapp','telegram-sender']: print('SERVICE',item['name'],item['pm2_env']['status'],item['pid'])
phones=[]
for line in r.stdout.splitlines():
 try:
  result=json.loads(line)
  if isinstance(result,list): phones=result
 except Exception: pass
process=next(x for x in pm if x['name']=='doran-whatsapp')
log=pathlib.Path(process['pm2_env']['pm_out_log_path'])
if log.is_file():
 lines=log.read_text(errors='replace').splitlines()[-3000:]
 for phone in phones:
  matches=[line for line in lines if 'WA_CONNECTION_STATE' in line and phone['id'] in line]
  for line in matches[-3:]: print('TARGET_CONNECTION_EVENT',line)
checks={}
for name in ['src/server/events/connectionUpdate.ts','src/pages/dashboard/phone.tsx']:
 checks[name]=(app/name).is_file()
print('SOURCE_PRESENT',json.dumps(checks))
print('SIGNIN_HTTP',subprocess.check_output(['curl','-sS','-o','/dev/null','-w','%{http_code}','https://dashboard.jeblast.com/signin'],universal_newlines=True))
"""
r=subprocess.run(['ssh','-o','BatchMode=yes','-o','ConnectTimeout=15','-i',str(Path.home()/'.ssh/codex_wa_server_ed25519'),'jeblast@103.196.146.186','python3','-'],input=remote,universal_newlines=True,capture_output=True)
print(r.stdout)
if r.returncode: print(r.stderr)
raise SystemExit(r.returncode)

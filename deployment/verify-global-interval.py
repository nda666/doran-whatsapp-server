"""Read-only release verification; credentials remain inside the server."""
from pathlib import Path
import subprocess, json, os, urllib.request, re
app=Path('/home/jeblast/repos/doran-whatsapp-server')
os.environ['PATH']='/home/jeblast/.local/share/doran-node/node-v24.21.0-linux-x64/bin:'+os.environ['PATH']
code="require('@next/env').loadEnvConfig(process.cwd());const {PrismaClient}=require('@prisma/client');const p=new PrismaClient();p.user.findFirst({where:{email:'admin@gmail.com',role:'ADMIN',isActive:true},select:{token:true}}).then(u=>process.stdout.write(u.token)).finally(()=>p.$disconnect())"
token=subprocess.check_output(['node','-e',code],cwd=app).decode().strip()
req=urllib.request.Request('http://127.0.0.1:3000/api/device-policies',headers={'Authorization':'Bearer '+token})
with urllib.request.urlopen(req,timeout=30) as response:
    assert response.status==200
    devices=json.load(response)
assert devices and all('globalInterval' in row for row in devices)
assert all(row['minIntervalSeconds'] is None or isinstance(row['minIntervalSeconds'],int) for row in devices)
build=(app/'.next/BUILD_ID').read_text().strip()
req=urllib.request.Request('https://dashboard.jeblast.com/signin?release='+build,headers={'Cache-Control':'no-cache','User-Agent':'Doran-Release-Verification'})
with urllib.request.urlopen(req,timeout=30) as response:
    html=response.read().decode(); found=re.search(r'"buildId":"([^"]+)"',html)
    assert response.status==200 and found and found.group(1)==build
states=json.loads(subprocess.check_output(['/usr/local/bin/pm2','jlist'],cwd=app))
print(json.dumps({'build':build,'devices':len(devices),'follow_global':sum(row['minIntervalSeconds'] is None for row in devices),'custom_minimum':sum(row['minIntervalSeconds'] is not None for row in devices),'global_interval':devices[0]['globalInterval'],'pm2':{p['name']:p['pm2_env']['status'] for p in states}},indent=2))

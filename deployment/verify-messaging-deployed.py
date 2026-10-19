"""Post-release checks; optional isolated completed fixture for export, removed immediately."""
from pathlib import Path
import subprocess, json, urllib.request, urllib.error, re, os

app = Path('/home/jeblast/repos/doran-whatsapp-server')
os.environ['PATH'] = '/home/jeblast/.local/share/doran-node/node-v24.21.0-linux-x64/bin:' + os.environ['PATH']
code = "require('@next/env').loadEnvConfig(process.cwd());const {PrismaClient}=require('@prisma/client');const p=new PrismaClient();Promise.all([p.user.findFirst({where:{email:'admin@gmail.com',role:'ADMIN',isActive:true},select:{token:true}}),p.campaign.findFirst({orderBy:{createdAt:'desc'},select:{id:true}})]).then(([u,c])=>process.stdout.write(JSON.stringify({token:u.token,campaignId:c?.id}))).finally(()=>p.$disconnect())"
auth = json.loads(subprocess.check_output(['node','-e',code],cwd=app))

def request(endpoint):
    req = urllib.request.Request('http://127.0.0.1:3000'+endpoint,headers={'Authorization':'Bearer '+auth['token']})
    try:
        with urllib.request.urlopen(req,timeout=30) as response: return response.status, response.read()
    except urllib.error.HTTPError as error: return error.code, error.read()

report = {}
for endpoint in ['/api/messaging-settings','/api/suppressions','/api/device-policies','/api/messaging-analytics?period=day','/api/messaging-analytics?period=week','/api/campaign-schedules?from=2026-10-01T00%3A00%3A00Z&to=2026-11-01T00%3A00%3A00Z']:
    status, body = request(endpoint); assert status == 200, endpoint+' HTTP '+str(status)
    value = json.loads(body); report[endpoint] = status
    if endpoint == '/api/device-policies':
        report['devices'] = len(value); report['online'] = sum(bool(p['isOnline']) for p in value)
    if endpoint == '/api/messaging-settings':
        report['opt_out_enabled'] = value['optOutEnabled']; report['offline_alerts_enabled'] = value['offlineAlertsEnabled']
fixture = None
if not auth.get('campaignId'):
    fixture_code = "require('@next/env').loadEnvConfig(process.cwd());const {PrismaClient}=require('@prisma/client');const {randomUUID,createHash}=require('node:crypto');const p=new PrismaClient();const id=randomUUID(),userId=randomUUID(),phoneId=randomUUID(),hash=createHash('sha256').update(id).digest('hex');(async()=>{await p.$transaction(async tx=>{await tx.campaign.create({data:{id,userId,name:'Pemeriksaan ekspor deployment',message:'Fixture pengujian tanpa pengiriman',phoneIds:[phoneId],scheduledAt:new Date(),status:'COMPLETED'}});await tx.waDispatch.create({data:{userId,phoneId,campaignId:id,storeId:'release-verification',transactionId:id,messageKey:'fixture',recipient:'6280000000000',dedupeKey:hash,payloadHash:hash,message:'Tidak dikirim; data sintetis untuk pemeriksaan ekspor',expiresAt:new Date(),status:'READ',attempts:1,sentAt:new Date(),deliveredAt:new Date(),readAt:new Date()}})});process.stdout.write(JSON.stringify({id}));})().finally(()=>p.$disconnect())"
    fixture = json.loads(subprocess.check_output(['node','-e',fixture_code],cwd=app))
    auth['campaignId'] = fixture['id']
try:
    for format in ['xlsx','pdf']:
        status, body = request('/api/campaign-report?campaignId='+auth['campaignId']+'&export='+format)
        assert status == 200, 'Export '+format+' HTTP '+str(status)
        assert body.startswith(b'PK' if format=='xlsx' else b'%PDF-'), 'Invalid '+format
        report['export_'+format] = {'status':status,'bytes':len(body)}
finally:
    if fixture:
        cleanup_code = "require('@next/env').loadEnvConfig(process.cwd());const {PrismaClient}=require('@prisma/client');const p=new PrismaClient();const id="+json.dumps(fixture['id'])+";(async()=>{await p.$transaction(async tx=>{await tx.waDispatch.deleteMany({where:{campaignId:id}});await tx.campaign.delete({where:{id}})})})().finally(()=>p.$disconnect())"
        subprocess.check_call(['node','-e',cleanup_code],cwd=app)
        report['export_fixture_removed'] = True
status, body = request('/health/dispatch')
report['dispatch_health_http'] = status
if status in [200,503]:
    health=json.loads(body);report['dispatch_alerts']=health.get('alerts');report['worker_running']=health.get('metrics',{}).get('running')
build = (app/'.next/BUILD_ID').read_text().strip()
req = urllib.request.Request('https://dashboard.jeblast.com/signin?release='+build,headers={'Cache-Control':'no-cache','User-Agent':'Doran-Release-Verification'})
with urllib.request.urlopen(req,timeout=30) as response:
    html=response.read().decode();found=re.search(r'"buildId":"([^"]+)"',html)
    assert response.status==200 and found and found.group(1)==build,'Public build mismatch'
report['public_build']=build
pm2=json.loads(subprocess.check_output(['/usr/local/bin/pm2','jlist'],cwd=app))
report['pm2']={p['name']:{'status':p['pm2_env']['status'],'pid':p['pid']} for p in pm2}
print(json.dumps(report,indent=2))

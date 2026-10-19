from pathlib import Path
import json
import re
import subprocess
import urllib.request
import urllib.error

ssh = ['ssh', '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=15', '-i', str(Path.home()/'.ssh/codex_wa_server_ed25519'), 'jeblast@103.196.146.186']
remote = '''from pathlib import Path
import json,subprocess,re
a=Path('/home/jeblast/repos/doran-whatsapp-server')
b=Path('/home/jeblast/backups/doran-chat-emoji-1792143823')
procs=json.loads(subprocess.check_output(['/usr/local/bin/pm2','jlist']))
js="""require('@next/env').loadEnvConfig(process.cwd());
const {PrismaClient}=require('@prisma/client');
const {randomUUID}=require('node:crypto');
const assert=require('node:assert/strict');
const db=new PrismaClient();
(async()=>{
  const rollback='EMOJI_VERIFY_ROLLBACK';
  try {
    await db.$transaction(async tx=>{
      const user=await tx.user.create({data:{name:'Emoji verification',email:'emoji-'+randomUUID()+'@example.invalid',password:randomUUID(),token:randomUUID(),approvalStatus:'APPROVED',isActive:true}});
      const phone=await tx.phone.create({data:{userId:user.id,name:'Emoji verification inactive',active:0}});
      const chat=await tx.chatConversation.create({data:{phoneId:phone.id,userId:user.id,jid:'628000000000@s.whatsapp.net',name:'Emoji fixture'}});
      const text='Unicode roundtrip: 😊 🙏 ❤️ 📦 ✌️';
      const row=await tx.chatMessage.create({data:{conversationId:chat.id,waMessageId:randomUUID(),direction:'OUT',type:'text',text,status:'SENT'}});
      const stored=await tx.chatMessage.findUniqueOrThrow({where:{id:row.id}});
      assert.equal(stored.text,text);
      assert(Buffer.from(stored.text).equals(Buffer.from(text)));
      throw new Error(rollback);
    });
    throw new Error('Expected rollback');
  } catch(error) {assert.equal(error.message,rollback);}
  console.log('EMOJI_DATABASE_ROUNDTRIP_OK: Unicode preserved; transaction rolled back; no WhatsApp transport invoked');
})().catch(()=>{console.error('Emoji database verification failed');process.exitCode=1;}).finally(()=>db.$disconnect());
"""
test=subprocess.run(['/home/jeblast/.local/share/doran-node/node-v24.21.0-linux-x64/bin/node','-'],input=js.encode(),cwd=a,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
if test.returncode:
    print(test.stderr.decode()[-2000:])
    raise RuntimeError('Unicode database verification failed')
print(test.stdout.decode().strip())
print(json.dumps({'build':(a/'.next/BUILD_ID').read_text().strip(),'processes':[{'name':p['name'],'pid':p['pid'],'status':p['pm2_env']['status'],'restarts':p['pm2_env'].get('restart_time')} for p in procs],'encryption_configured':bool(re.search(r'^AI_SECRET_KEY=[a-fA-F0-9]{64}$',(a/'.env').read_text(),re.M)),'staging_removed':not Path('/home/jeblast/repos/.doran-chat-emoji-1792143823').exists(),'success':json.loads((b/'SUCCESS.json').read_text())}))
'''
result = subprocess.run(ssh + ['python3', '-'], input=remote.encode(), capture_output=True)
if result.returncode: raise RuntimeError(result.stdout.decode()[-2500:] + result.stderr.decode()[-1500:])
lines = result.stdout.decode().splitlines()
assert any('EMOJI_DATABASE_ROUNDTRIP_OK' in line for line in lines)
data = json.loads(lines[-1])
data['unicode_database_roundtrip'] = True
for route in ['/signin', '/dashboard/conversations', '/dashboard/ai-plugins']:
    try:
        response = urllib.request.urlopen(urllib.request.Request('https://dashboard.jeblast.com' + route + '?deploy=chat-emoji-20261016', headers={'User-Agent':'Mozilla/5.0 DoranDeploymentVerification'}), timeout=25)
    except urllib.error.HTTPError as error:
        data.setdefault('public_http', []).append({'route':route,'status':error.code,'server':error.headers.get('server')})
        continue
    body = response.read().decode()
    found = re.search(r'"buildId":"([^"]+)"', body)
    data.setdefault('public_http', []).append({'route': route, 'status': response.status, 'final_url': response.url, 'build': found.group(1) if found else None})
    assert response.status == 200
    if found: assert found.group(1) == data['build'], 'Public site serves a different build'
assert data['encryption_configured'] and data['staging_removed']
assert data['success']['active_build'] == data['build']
assert all(p['status'] == 'online' for p in data['processes'])
print(json.dumps(data, indent=2))
root = Path(__file__).resolve().parent.parent
(root/'deployment/chat-emoji-deployed-20261016.json').write_text(json.dumps(data, indent=2))

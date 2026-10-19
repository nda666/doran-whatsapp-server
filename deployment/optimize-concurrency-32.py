from pathlib import Path
import subprocess, re
from urllib.parse import urlsplit, urlunsplit, parse_qsl, urlencode

def update_url(content):
    pattern = re.compile(r'^(DATABASE_URL=)([^\r\n]+)',re.M)
    def update(match):
        value=match.group(2).strip()
        quote=value[0] if value[0] in ('"',"'") else ''
        if quote:
            assert value[-1]==quote
            value=value[1:-1]
        parts=urlsplit(value)
        assert parts.scheme=='mysql'
        params=dict(parse_qsl(parts.query,keep_blank_values=True))
        params.update(connection_limit='40',pool_timeout='10')
        return match.group(1)+quote+urlunsplit((parts.scheme,parts.netloc,parts.path,urlencode(params),parts.fragment))+quote
    result,count=pattern.subn(update,content)
    assert count==1
    return result

if __name__=='__main__':
    import sys
    if len(sys.argv)>1 and sys.argv[1]=='local':
        env=Path(__file__).resolve().parent.parent/'.env'
        env.write_text(update_url(env.read_text()),encoding='utf-8')
        print('LOCAL_POOL_CONFIG_UPDATED_NO_CREDENTIAL_OUTPUT')
        raise SystemExit(0)

remote = r'''
from pathlib import Path
from datetime import datetime
import subprocess,json,shutil,re,time
from urllib.parse import urlsplit,urlunsplit,parse_qsl,urlencode
app=Path('/home/jeblast/repos/doran-whatsapp-server')
node='/home/jeblast/.local/share/doran-node/node-v24.21.0-linux-x64/bin/node'
pm2='/usr/local/bin/pm2'
before=json.loads(subprocess.check_output([pm2,'jlist']))
target=next(p for p in before if p['name']=='doran-whatsapp')
assert target['pm2_env']['status']=='online'
assert target['pm2_env'].get('DISPATCH_CONCURRENCY')=='32'
assert not target['pm2_env'].get('DATABASE_URL'), 'PM2 database URL override requires reconciliation'
other={p['name']:p['pid'] for p in before if p['name']!='doran-whatsapp'}
backup=Path('/home/jeblast/backups')/('doran-pool32-'+datetime.utcnow().strftime('%Y%m%dT%H%M%SZ'))
backup.mkdir(mode=0o700)
files=['.env','ecosystem.config.js','deployment/verify-pm2-optimization-live.cjs']
for name in files:
    src=app/name;dst=backup/name;dst.parent.mkdir(parents=True,exist_ok=True,mode=0o700);shutil.copy2(src,dst);dst.chmod(0o600)
def update(match):
    value=match.group(2).strip();quote=value[0] if value[0] in ('"',"'") else ''
    if quote:
        assert value[-1]==quote
        value=value[1:-1]
    parts=urlsplit(value);assert parts.scheme=='mysql'
    params=dict(parse_qsl(parts.query,keep_blank_values=True));params.update(connection_limit='40',pool_timeout='10')
    return match.group(1)+quote+urlunsplit((parts.scheme,parts.netloc,parts.path,urlencode(params),parts.fragment))+quote
env=app/'.env';new,count=re.subn(r'^(DATABASE_URL=)([^\r\n]+)',update,env.read_text(),flags=re.M);assert count==1
env.write_text(new)
verify=app/'deployment/verify-pm2-optimization-live.cjs'
old=verify.read_text();needle="  assert.equal(e.QUEUE_ENABLED, 'false'); assert.equal(e.DISPATCH_CONCURRENCY, '32');"
assert needle in old
addition="\n  const databaseUrl = new URL(e.DATABASE_URL || process.env.DATABASE_URL);\n  assert.equal(databaseUrl.searchParams.get('connection_limit'), '40');\n  assert.equal(databaseUrl.searchParams.get('pool_timeout'), '10');"
if "const databaseUrl =" not in old: verify.write_text(old.replace(needle,needle+addition))
# Concurrent, read-only queries verify the pool independently of WhatsApp transport.
test=r"""
require('@next/env').loadEnvConfig(process.cwd());
const assert=require('assert/strict');const {PrismaClient}=require('@prisma/client');
const url=new URL(process.env.DATABASE_URL);assert.equal(url.searchParams.get('connection_limit'),'40');assert.equal(url.searchParams.get('pool_timeout'),'10');
const p=new PrismaClient({log:['info']});
(async()=>{
const t=Date.now();const results=await Promise.all(Array.from({length:40},()=>p.$queryRawUnsafe('SELECT CONNECTION_ID() AS id, SLEEP(0.1) AS pause')));
const used=new Set(results.map(r=>String(r[0].id))).size;
assert(used>17&&used<=40,'Pool did not expand as expected');
console.log(JSON.stringify({result:'CONCURRENT_READ_POOL_TEST_PASSED',queries:40,uniqueConnections:used,durationMs:Date.now()-t}));
})().catch(e=>{console.error(JSON.stringify({testError:e.code||e.name}));process.exitCode=1}).finally(()=>p.$disconnect());
"""
try:
    subprocess.run([node,'--check',str(verify)],check=True)
    subprocess.run([node,'-e',test],cwd=str(app),check=True)
except Exception:
    for name in files: shutil.copy2(backup/name,app/name)
    raise
print('POOL_CONFIG_READY backup='+str(backup),flush=True)
result=subprocess.run([pm2,'restart',str(app/'ecosystem.config.js'),'--only','doran-whatsapp','--update-env'],cwd=str(app),stdout=subprocess.PIPE,stderr=subprocess.PIPE)
assert result.returncode==0,'PM2 restart failed'
for attempt in range(45):
    after=json.loads(subprocess.check_output([pm2,'jlist']))
    current=next(p for p in after if p['name']=='doran-whatsapp')
    assert {p['name']:p['pid'] for p in after if p['name']!='doran-whatsapp'}==other
    if current['pid']!=target['pid'] and current['pm2_env']['status']=='online':
        verify_result=subprocess.run([node,str(verify)],cwd=str(app),stdout=subprocess.PIPE,stderr=subprocess.PIPE)
        if verify_result.returncode==0:
            print(verify_result.stdout.decode(),flush=True);break
    time.sleep(2)
else: raise RuntimeError('Runtime verification did not pass')
subprocess.run([pm2,'save'],check=True,stdout=subprocess.DEVNULL)
print(json.dumps({'result':'POOL40_TIMEOUT10_ACTIVE_MEMORY_LIMITS_RETAINED','pid':current['pid'],'otherProcessesUnchanged':True}),flush=True)
'''
result=subprocess.run(['ssh','-o','BatchMode=yes','-o','ConnectTimeout=15','-i',str(Path.home()/'.ssh/codex_wa_server_ed25519'),'jeblast@103.196.146.186','python3','-u','-'],input=remote,text=True)
raise SystemExit(result.returncode)

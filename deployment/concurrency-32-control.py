from pathlib import Path
import subprocess, sys

snapshot = r'''
from pathlib import Path
import json, subprocess, time, os, re
app = Path('/home/jeblast/repos/doran-whatsapp-server')
pm2 = '/usr/local/bin/pm2'
node = '/home/jeblast/.local/share/doran-node/node-v24.21.0-linux-x64/bin/node'
def cpu():
    fields = [int(v) for v in Path('/proc/stat').read_text().splitlines()[0].split()[1:9]]
    return sum(fields), fields[3] + fields[4]
a = cpu(); time.sleep(1); b = cpu()
memory = {line.split(':')[0]: int(line.split()[1]) for line in Path('/proc/meminfo').read_text().splitlines() if line.split(':')[0] in ('MemTotal', 'MemAvailable', 'SwapTotal', 'SwapFree')}
processes = json.loads(subprocess.check_output([pm2, 'jlist']))
target = next(p for p in processes if p['name'] == 'doran-whatsapp')
e = target['pm2_env']
errors = {}
for name in ('pm_out_log_path', 'pm_err_log_path'):
    p = Path(e[name])
    if not p.is_file(): continue
    with p.open('rb') as f:
        f.seek(max(0, p.stat().st_size - 200000)); lines = f.read().decode(errors='replace').splitlines()
    for line in lines:
        match = re.match(r'(\d{4}-\d\d-\d\d \d\d:\d\d:\d\d)', line)
        if not match: continue
        stamp = time.mktime(time.strptime(match.group(1), '%Y-%m-%d %H:%M:%S'))
        if stamp < time.time() - 300: continue
        for code in ('DISPATCH_POLL_FAILED', 'DISPATCH_JOB_FAILED', 'DISPATCH_ACK_FAILED', 'DISPATCH_HEARTBEAT_FAILED', 'DISPATCH_RECOVERY_FAILED', 'DISPATCH_MEDIA_FAILED', 'SERVER_SHUTDOWN_TIMEOUT', 'FATAL ERROR'):
            if code in line: errors[code] = errors.get(code, 0) + 1
print(json.dumps({'at': time.strftime('%Y-%m-%d %H:%M:%S %z'), 'cpuBusyPercent': round(100*(1-(b[1]-a[1])/(b[0]-a[0])),1), 'loadAverage': os.getloadavg(), 'memoryMiB': {k:round(v/1024) for k,v in memory.items()}, 'app': {'pid': target['pid'], 'status':e['status'], 'concurrency':e.get('DISPATCH_CONCURRENCY'), 'memoryMiB':round(target['monit']['memory']/1048576,1), 'cpuPercent':target['monit']['cpu'], 'restartCount':e['restart_time']}, 'dispatchErrorsLast5Minutes':errors}), flush=True)
js = r"""
require('@next/env').loadEnvConfig(process.cwd());
const {PrismaClient}=require('@prisma/client'); const p=new PrismaClient();
(async()=>{
const admin=await p.user.findFirst({where:{email:'admin@gmail.com',role:'ADMIN',isActive:true,approvalStatus:'APPROVED'}});
if(!admin) throw new Error('No verification account');
const start=Date.now();
const hresp=await fetch('http://127.0.0.1:3000/health/dispatch',{headers:{Authorization:'Bearer '+admin.token},signal:AbortSignal.timeout(15000)});
const h=await hresp.json();
const page=await fetch('https://dashboard.jeblast.com/signin',{signal:AbortSignal.timeout(15000)});
const cutoff=new Date(Date.now()-300000);
const [max,threads,statuses,sent,delivered,recentUncertain]=await Promise.all([
p.$queryRawUnsafe('SELECT @@global.max_connections AS maxConnections'),
p.$queryRawUnsafe("SHOW GLOBAL STATUS WHERE Variable_name IN ('Threads_connected','Threads_running','Max_used_connections','Aborted_connects')"),
p.waDispatch.groupBy({by:['status'],where:{status:{in:['QUEUED','PROCESSING']}},_count:{_all:true}}),
p.waDispatch.count({where:{sentAt:{gte:cutoff}}}),
p.waDispatch.count({where:{deliveredAt:{gte:cutoff}}}),
p.waDispatch.count({where:{status:'UNCERTAIN',updatedAt:{gte:cutoff}}})]);
console.log(JSON.stringify({healthStatus:hresp.status,publicPageStatus:page.status,checkDurationMs:Date.now()-start,worker:h.metrics,alerts:h.alerts,backlog:{onlineSenders:h.pending_senders.filter(s=>s.connected).length,offlineSenders:h.pending_senders.filter(s=>!s.connected).length,onlineJobs:h.pending_senders.filter(s=>s.connected).reduce((n,s)=>n+s.jobs,0),offlineJobs:h.pending_senders.filter(s=>!s.connected).reduce((n,s)=>n+s.jobs,0)},database:{maxConnections:Number(max[0].maxConnections),status:threads},queue:statuses,sentLast5Minutes:sent,deliveredLast5Minutes:delivered,uncertainUpdatedLast5Minutes:recentUncertain},(k,v)=>typeof v==='bigint'?Number(v):v));
})().catch(e=>{console.error(JSON.stringify({verificationError:e.code||e.name}));process.exitCode=1}).finally(()=>p.$disconnect());
"""
subprocess.run([node,'-e',js],cwd=str(app),check=True)
'''

apply = r'''
from pathlib import Path
from datetime import datetime
import subprocess, json, re, shutil, time
app=Path('/home/jeblast/repos/doran-whatsapp-server')
pm2='/usr/local/bin/pm2'
node='/home/jeblast/.local/share/doran-node/node-v24.21.0-linux-x64/bin/node'
before=json.loads(subprocess.check_output([pm2,'jlist']))
target=next(p for p in before if p['name']=='doran-whatsapp')
assert target['pm2_env']['status']=='online'
assert str(target['pm2_env'].get('DISPATCH_CONCURRENCY'))=='16'
other={p['name']:p['pid'] for p in before if p['name']!='doran-whatsapp'}
backup=Path('/home/jeblast/backups')/('doran-concurrency-32-'+datetime.utcnow().strftime('%Y%m%dT%H%M%SZ'))
backup.mkdir(mode=0o700)
names=['src/server/dispatch/worker.ts','dist/src/server/dispatch/worker.js','ecosystem.config.js','.env','deployment/verify-pm2-optimization-live.cjs']
for name in names:
    src=app/name
    if src.is_file():
        dst=backup/name; dst.parent.mkdir(parents=True,exist_ok=True,mode=0o700); shutil.copy2(src,dst); dst.chmod(0o600)
source=app/names[0]
old=source.read_text()
assert old.count('const concurrency = Math.min(16,')==1
new=old.replace('const concurrency = Math.min(16,','const concurrency = Math.min(32,')
source.write_text(new)
config=app/'ecosystem.config.js'
changed,count=re.subn(r'(DISPATCH_CONCURRENCY:\s*["\x27])16(["\x27])',r'\g<1>32\2',config.read_text())
assert count==1
config.write_text(changed)
env=app/'.env'
env.write_text(re.sub(r'^DISPATCH_CONCURRENCY=.*$','DISPATCH_CONCURRENCY=32',env.read_text(),flags=re.M))
verify=app/'deployment/verify-pm2-optimization-live.cjs'
if verify.is_file(): verify.write_text(verify.read_text().replace("assert.equal(e.DISPATCH_CONCURRENCY, '16')","assert.equal(e.DISPATCH_CONCURRENCY, '32')"))
# Compile only the changed worker, preserving the rest of the deployed build.
compile_js=r"""
const ts=require('typescript'),fs=require('fs');
const cfg=ts.readConfigFile('tsconfig.server.json',ts.sys.readFile);
const parsed=ts.parseJsonConfigFileContent(cfg.config,ts.sys,process.cwd());
const source='src/server/dispatch/worker.ts';
const result=ts.transpileModule(fs.readFileSync(source,'utf8'),{compilerOptions:parsed.options,fileName:source,reportDiagnostics:true});
const errors=(result.diagnostics||[]).filter(d=>d.category===ts.DiagnosticCategory.Error);
if(errors.length) throw new Error('Worker compile failed');
if(!result.outputText.includes('Math.min(32,')) throw new Error('Compiled cap missing');
fs.writeFileSync('dist/src/server/dispatch/worker.js',result.outputText);
"""
try:
    typecheck_js=r"""
const ts=require('typescript'),path=require('path');
const cfg=ts.readConfigFile('tsconfig.server.json',ts.sys.readFile);
const parsed=ts.parseJsonConfigFileContent(cfg.config,ts.sys,process.cwd());
const root=path.join(process.cwd(),'src')+path.sep;
const files=parsed.fileNames.filter(f=>path.resolve(f).startsWith(root)||path.basename(f)==='next-env.d.ts');
const diagnostics=ts.getPreEmitDiagnostics(ts.createProgram(files,{...parsed.options,noEmit:true,incremental:false}));
if(diagnostics.length){console.error(ts.formatDiagnosticsWithColorAndContext(diagnostics,{getCurrentDirectory:()=>process.cwd(),getCanonicalFileName:f=>f,getNewLine:()=>String.fromCharCode(10)}));process.exit(1)}
"""
    subprocess.run([node,'-e',typecheck_js],cwd=str(app),check=True)
    subprocess.run([node,'-e',compile_js],cwd=str(app),check=True)
    subprocess.run([node,'--check',str(app/'dist/src/server/dispatch/worker.js')],check=True)
    subprocess.run([node,'--check',str(config)],check=True)
except Exception:
    for name in names:
        saved=backup/name
        if saved.is_file(): shutil.copy2(saved,app/name)
    raise
print('TYPECHECK_AND_WORKER_BUILD_PASSED backup='+str(backup),flush=True)
restart=subprocess.run([pm2,'restart',str(config),'--only','doran-whatsapp','--update-env'],cwd=str(app),stdout=subprocess.PIPE,stderr=subprocess.PIPE)
assert restart.returncode==0,'PM2 restart failed'
for i in range(60):
    after=json.loads(subprocess.check_output([pm2,'jlist']))
    current=next(p for p in after if p['name']=='doran-whatsapp')
    assert {p['name']:p['pid'] for p in after if p['name']!='doran-whatsapp'}==other
    log=Path(current['pm2_env']['pm_out_log_path'])
    with log.open('rb') as f:
        f.seek(max(0,log.stat().st_size-20000)); tail=f.read().decode(errors='replace')
    starts=[line for line in tail.splitlines() if 'DISPATCH_WORKER_STARTED' in line]
    if current['pm2_env']['status']=='online' and current['pm2_env'].get('DISPATCH_CONCURRENCY')=='32' and starts and '"concurrency":32' in starts[-1]:
        print(starts[-1],flush=True); break
    time.sleep(2)
else: raise RuntimeError('Concurrency 32 startup verification timed out')
subprocess.run([pm2,'save'],check=True,stdout=subprocess.DEVNULL)
print(json.dumps({'result':'CONCURRENCY_32_ACTIVE','pid':current['pid'],'restartCount':current['pm2_env']['restart_time'],'otherProcessesUnchanged':True}),flush=True)
'''

mode = sys.argv[1] if len(sys.argv)>1 else 'snapshot'
assert mode in ('snapshot','apply','observe','observe-short')
remote = snapshot if mode=='snapshot' else apply
if mode in ('observe','observe-short'):
    observations = 5 if mode == 'observe-short' else 7
    remote = 'import time\nfor observation in range('+str(observations)+'):\n' + '\n'.join('    '+line for line in snapshot.splitlines()) + '\n    if observation < '+str(observations-1)+': time.sleep(30)\n'
result = subprocess.run(['ssh','-o','BatchMode=yes','-o','ConnectTimeout=15','-i',str(Path.home()/'.ssh/codex_wa_server_ed25519'),'jeblast@103.196.146.186','python3','-u','-'], input=remote, text=True)
raise SystemExit(result.returncode)

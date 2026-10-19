from pathlib import Path
import base64,json,subprocess
root=Path(__file__).resolve().parent.parent
baseline=json.loads((root/'tmp/random-delay-baseline.json').read_text())
names=list(baseline)+['src/server/dispatch/timing.ts']
payload={n:base64.b64encode((root/n).read_bytes()).decode() for n in names}
remote=r'''
from pathlib import Path
from datetime import datetime
import json,base64,hashlib,subprocess,shutil,re,time
app=Path('/home/jeblast/repos/doran-whatsapp-server')
node='/home/jeblast/.local/share/doran-node/node-v24.21.0-linux-x64/bin/node'
pm2='/usr/local/bin/pm2'
baseline=BASELINE_VALUE
payload=PAYLOAD_VALUE
for name,digest in baseline.items(): assert hashlib.sha256((app/name).read_bytes()).hexdigest()==digest,'Source baseline differs: '+name
assert not (app/'src/server/dispatch/timing.ts').exists()
before=json.loads(subprocess.check_output([pm2,'jlist']))
target=next(p for p in before if p['name']=='doran-whatsapp')
assert target['pm2_env']['status']=='online'
other={p['name']:p['pid'] for p in before if p['name']!='doran-whatsapp'}
backup=Path('/home/jeblast/backups')/('doran-random-delay-'+datetime.utcnow().strftime('%Y%m%dT%H%M%SZ'))
backup.mkdir(mode=0o700)
files=list(payload)+['.env','dist/src/server/dispatch/worker.js','dist/src/server/dispatch/timing.js']
existed={}
for name in files:
    src=app/name;existed[name]=src.exists()
    if src.exists():
        dst=backup/name;dst.parent.mkdir(parents=True,exist_ok=True,mode=0o700);shutil.copy2(src,dst);dst.chmod(0o600)
def restore():
    for name in files:
        if existed[name]:shutil.copy2(backup/name,app/name)
        elif (app/name).is_file():(app/name).unlink()
try:
    for name,encoded in payload.items():(app/name).write_bytes(base64.b64decode(encoded))
    env=app/'.env'
    content=re.sub(r'^DISPATCH_INTERVAL_MS=[^\r\n]*\r?\n?','',env.read_text(),flags=re.M)
    for key,value in [('DISPATCH_INTERVAL_MIN_MS','2000'),('DISPATCH_INTERVAL_MAX_MS','5000')]:
        content,count=re.subn('^'+key+r'=[^\r\n]*',key+'='+value,content,flags=re.M)
        if not count:content=content.rstrip()+'\n'+key+'='+value+'\n'
    env.write_text(content)
    compile=r"""
const ts=require('typescript'),fs=require('fs'),path=require('path');
const cfg=ts.readConfigFile('tsconfig.server.json',ts.sys.readFile),parsed=ts.parseJsonConfigFileContent(cfg.config,ts.sys,process.cwd());
const root=path.join(process.cwd(),'src')+path.sep;
const files=parsed.fileNames.filter(f=>path.resolve(f).startsWith(root)||path.basename(f)==='next-env.d.ts');
const diagnostics=ts.getPreEmitDiagnostics(ts.createProgram(files,{...parsed.options,noEmit:true,incremental:false}));
if(diagnostics.length)throw new Error('Application type check failed');
for(const source of ['src/server/dispatch/worker.ts','src/server/dispatch/timing.ts']){
const result=ts.transpileModule(fs.readFileSync(source,'utf8'),{compilerOptions:parsed.options,fileName:source,reportDiagnostics:true});
if(result.diagnostics?.some(d=>d.category===ts.DiagnosticCategory.Error))throw new Error('Compilation failed');
fs.writeFileSync('dist/'+source.replace(/\.ts$/,'.js'),result.outputText);
}
"""
    subprocess.run([node,'-e',compile],cwd=str(app),check=True)
    for file in ['ecosystem.config.js','dist/src/server/dispatch/worker.js','dist/src/server/dispatch/timing.js']:subprocess.run([node,'--check',file],cwd=str(app),check=True)
except Exception:
    restore();raise
print('TYPECHECK_AND_RANDOM_DELAY_BUILD_PASSED backup='+str(backup),flush=True)
try:
    subprocess.run([pm2,'restart',str(app/'ecosystem.config.js'),'--only','doran-whatsapp','--update-env'],cwd=str(app),check=True,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
    for attempt in range(40):
        after=json.loads(subprocess.check_output([pm2,'jlist']))
        current=next(p for p in after if p['name']=='doran-whatsapp')
        assert {p['name']:p['pid'] for p in after if p['name']!='doran-whatsapp'}==other
        log=Path(current['pm2_env']['pm_out_log_path'])
        with log.open('rb') as f:f.seek(max(0,log.stat().st_size-20000));tail=f.read().decode(errors='replace')
        starts=[line for line in tail.splitlines() if 'DISPATCH_WORKER_STARTED' in line]
        if current['pid']!=target['pid'] and current['pm2_env']['status']=='online' and starts and '"delayMinMs":2000,"delayMaxMs":5000' in starts[-1]:
            assert current['pm2_env']['DISPATCH_CONCURRENCY']=='32'
            assert current['pm2_env']['DISPATCH_INTERVAL_MIN_MS']=='2000' and current['pm2_env']['DISPATCH_INTERVAL_MAX_MS']=='5000'
            print(starts[-1],flush=True);break
        time.sleep(2)
    else:raise RuntimeError('Worker startup check failed')
    time.sleep(6)
    subprocess.run([node,'deployment/verify-pm2-optimization-live.cjs'],cwd=str(app),check=True)
except Exception:
    restore();subprocess.run([pm2,'restart',str(app/'ecosystem.config.js'),'--only','doran-whatsapp','--update-env'],cwd=str(app),stdout=subprocess.PIPE,stderr=subprocess.PIPE)
    print('ROLLED_BACK_RANDOM_DELAY',flush=True);raise
subprocess.run([pm2,'save'],check=True,stdout=subprocess.DEVNULL)
print(json.dumps({'result':'RANDOM_2_TO_5_SECONDS_ACTIVE','pid':current['pid'],'otherProcessesUnchanged':True}),flush=True)
'''.replace('BASELINE_VALUE',repr(baseline)).replace('PAYLOAD_VALUE',repr(payload))
r=subprocess.run(['ssh','-o','BatchMode=yes','-o','ConnectTimeout=15','-i',str(Path.home()/'.ssh/codex_wa_server_ed25519'),'jeblast@103.196.146.186','python3','-u','-'],input=remote,text=True)
raise SystemExit(r.returncode)

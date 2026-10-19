"""Isolated build, full database backup, additive migration, runtime smoke test and rollback."""
from pathlib import Path
import subprocess, os, json, hashlib, zipfile, shutil, time, sys, gzip, urllib.request, urllib.error
from urllib.parse import unquote

app = Path('/home/jeblast/repos/doran-whatsapp-server')
sys.path.insert(0, str(app/'deployment'))
from stage_cleanup import StageCleanup
from backup_retention import prune_deploy_backups

stamp = str(int(time.time()))
stage = app.parent / ('.doran-quota-menu-' + stamp)
backup = Path('/home/jeblast/backups') / ('doran-quota-menu-' + stamp)
incoming = Path('/home/jeblast/quota-menu-20261017.zip')
os.environ['PATH'] = '/home/jeblast/.local/share/doran-node/node-v24.21.0-linux-x64/bin:' + os.environ['PATH']
assert app.is_dir() and not stage.exists() and not backup.exists()
assert shutil.disk_usage(app).free > 4 * 1024**3, 'Insufficient disk for isolated dependencies and backup'
backup.mkdir(mode=0o700); stage.mkdir(mode=0o700)
cleanup = StageCleanup(app.parent, stage)
print('BACKUP', backup, flush=True)
build_before = (app/'.next/BUILD_ID').read_text()
with zipfile.ZipFile(incoming) as archive:
    manifest = json.loads(archive.read('manifest.json')); baseline = json.loads(archive.read('baseline.json'))
    for name, expected in baseline.items():
        assert not Path(name).is_absolute() and '..' not in Path(name).parts
        live = app/name
        assert (hashlib.sha256(live.read_bytes()).hexdigest() if live.exists() else None) == expected, 'Source changed: ' + name
        if live.is_file():
            saved = backup/'source'/name; saved.parent.mkdir(parents=True, exist_ok=True); shutil.copy2(live, saved)
    for name in ['src','public','prisma','deployment','package.json','package-lock.json','next.config.js','next-i18next.config.js','tsconfig.json','tsconfig.server.json','.eslintrc.json','ecosystem.config.js']:
        source, target = app/name, stage/name
        if source.is_dir(): shutil.copytree(source, target)
        else: shutil.copy2(source, target)
    shutil.copy2(app/'.env', stage/'.env'); (stage/'.env').chmod(0o600)
    for name, digest in manifest.items():
        data = archive.read(name); assert hashlib.sha256(data).hexdigest() == digest
        target = stage/name; target.parent.mkdir(parents=True, exist_ok=True); target.write_bytes(data)
(backup/'manifest.json').write_text(json.dumps(manifest)); (backup/'baseline.json').write_text(json.dumps(baseline))
env = dict(os.environ, WHATSAPP_ENABLED='false', DISPATCH_QUEUE_ENABLED='false', QUEUE_ENABLED='false', MESSAGING_ALERTS_ENABLED='false', NODE_OPTIONS='--max-old-space-size=8192')

def run(command, label, cwd=stage):
    with (backup/(label+'.log')).open('w') as log:
        result = subprocess.run(command, cwd=cwd, env=env, stdout=log, stderr=subprocess.STDOUT)
    if result.returncode:
        print('FAILED', label, flush=True)
        # Build/test logs contain no credentials or customer rows.
        print((backup/(label+'.log')).read_text()[-10000:], flush=True)
        raise RuntimeError(label)
    print('PASSED', label, flush=True)

run(['npm','ci','--no-audit','--no-fund'], 'dependencies')
run(['npx','prisma','generate'], 'prisma-client')
run(['node','deployment/verify-messaging-improvements.cjs'], 'behavioral-tests')
run(['node','deployment/verify-campaign-personalization.cjs'], 'campaign-regression')
run(['npm','run','build'], 'production-build')
assert (app/'.next/BUILD_ID').read_text() == build_before, 'Concurrent deployment'
for name, expected in baseline.items():
    live=app/name; assert (hashlib.sha256(live.read_bytes()).hexdigest() if live.exists() else None) == expected, 'Source changed: '+name

# Back up DB with password only in child environment, never in command arguments/logs.
db_code = "require('@next/env').loadEnvConfig(process.cwd());const u=new URL(process.env.DATABASE_URL);console.log(JSON.stringify({host:u.hostname,port:u.port||'3306',user:decodeURIComponent(u.username),password:decodeURIComponent(u.password),database:u.pathname.slice(1)}))"
config = json.loads(subprocess.check_output(['node','-e',db_code], cwd=app, env=env))
dump = shutil.which('mysqldump'); assert dump, 'mysqldump unavailable; deployment aborted before migration'
dump_env = dict(env, MYSQL_PWD=config['password'])
with (backup/'database.sql.gz').open('wb') as output, (backup/'database-backup.log').open('wb') as errors:
    process = subprocess.Popen([dump,'--single-transaction','--no-tablespaces','--routines','--triggers','--host='+config['host'],'--port='+config['port'],'--user='+config['user'],config['database']], env=dump_env, stdout=subprocess.PIPE, stderr=errors)
    with gzip.GzipFile(fileobj=output,mode='wb') as compressed: shutil.copyfileobj(process.stdout,compressed)
    assert process.wait() == 0, 'Database backup failed; migration not started'
(backup/'database.sql.gz').chmod(0o600)
print('PASSED database-backup', flush=True)
run(['npx','prisma','migrate','deploy'], 'database-migration')
run(['node','deployment/verify-messaging-db.cjs'], 'mysql-concurrency')

def pm2(*args): return subprocess.check_output(['/usr/local/bin/pm2',*args],cwd=app)
def processes(): return {p['name']:p for p in json.loads(pm2('jlist'))}
def ready(port):
    for _ in range(60):
        try:
            if urllib.request.urlopen('http://127.0.0.1:'+str(port)+'/signin',timeout=3).status==200: return True
        except Exception: pass
        time.sleep(1)
    return False

# Boot candidate with transports/workers disabled. This also validates compiled server imports.
with (backup/'candidate-server.log').open('w') as log:
    candidate = subprocess.Popen(['node','dist/src/server/index.js'],cwd=stage,env=dict(env,NODE_ENV='production',HOST='127.0.0.1',PORT='3107',NEXTAUTH_URL_INTERNAL='http://127.0.0.1:3107'),stdout=log,stderr=subprocess.STDOUT)
    try:
        assert ready(3107), 'Candidate server did not start'
        # Obtain a bearer token only inside this process; never print or persist it.
        token_code="require('@next/env').loadEnvConfig(process.cwd());const {PrismaClient}=require('@prisma/client');const p=new PrismaClient();p.user.findFirst({where:{role:'ADMIN',approvalStatus:'APPROVED',isActive:true},select:{token:true}}).then(u=>{if(!u)process.exitCode=1;else process.stdout.write(u.token)}).finally(()=>p.$disconnect())"
        token = subprocess.check_output(['node','-e',token_code],cwd=stage,env=env).decode().strip()
        for endpoint in ['/api/messaging-settings','/api/suppressions','/api/device-policies','/api/messaging-analytics?period=day','/api/messaging-analytics?period=week','/api/campaign-schedules?from=2026-10-01T00%3A00%3A00Z&to=2026-11-01T00%3A00%3A00Z']:
            request=urllib.request.Request('http://127.0.0.1:3107'+endpoint,headers={'Authorization':'Bearer '+token})
            with urllib.request.urlopen(request,timeout=30) as response: assert response.status==200; json.load(response)
        print('PASSED candidate-startup-and-readonly-apis',flush=True)
    finally:
        candidate.terminate()
        try: candidate.wait(timeout=30)
        except subprocess.TimeoutExpired: candidate.kill(); candidate.wait()

before=processes(); unrelated={name:p['pid'] for name,p in before.items() if name!='doran-whatsapp'}
old=backup/'runtime'; old.mkdir(mode=0o700)
moved_old=[]; moved_new=[]
cleanup.preserve=True
pm2('stop','doran-whatsapp')
try:
    for name in ['.next','dist','node_modules']:
        (app/name).rename(old/name); moved_old.append(name)
        (stage/name).rename(app/name); moved_new.append(name)
    for name in manifest:
        target=app/name;target.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(stage/name,target)
    pm2('startOrReload','ecosystem.config.js','--only','doran-whatsapp','--update-env')
    assert ready(3000), 'Production startup failed'
    after=processes(); assert after['doran-whatsapp']['pm2_env']['status']=='online'
    for name,pid in unrelated.items(): assert after[name]['pid']==pid, 'Unrelated process changed: '+name
    for name,digest in manifest.items(): assert hashlib.sha256((app/name).read_bytes()).hexdigest()==digest,name
    time.sleep(5); assert processes()['doran-whatsapp']['pid']==after['doran-whatsapp']['pid'],'Unexpected restart'
except Exception:
    pm2('stop','doran-whatsapp')
    for name in moved_new: (app/name).rename(stage/name)
    for name in moved_old: (old/name).rename(app/name)
    for name,digest in baseline.items():
        if digest is None:
            if (app/name).is_file(): (app/name).unlink()
        else: shutil.copy2(backup/'source'/name,app/name)
    pm2('startOrReload','ecosystem.config.js','--only','doran-whatsapp','--update-env')
    assert ready(3000), 'Rollback startup failed; staging retained' 
    cleanup.preserve=False
    print('ROLLED_BACK_RUNTIME; additive database migration retained',flush=True)
    raise
cleanup.preserve=False
cleanup.cleanup()
pm2('save')
(backup/'SUCCESS.json').write_text(json.dumps({'active_build':(app/'.next/BUILD_ID').read_text().strip(),'previous_build':build_before.strip()}))
prune_deploy_backups(backup.parent,backup)
print('DEPLOYED_QUOTA_MENU', (app/'.next/BUILD_ID').read_text().strip(),flush=True)
print('BACKUP',backup,flush=True)

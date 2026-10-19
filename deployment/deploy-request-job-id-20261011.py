"""Build in isolation, back up runtime/source, promote with automatic rollback."""
from pathlib import Path
import hashlib
import json
import os
import shutil
import subprocess
import sys
import time
import urllib.request
import zipfile

def copy_overlay(source, target):
    target.mkdir(parents=True, exist_ok=True)
    for item in source.iterdir():
        dest = target / item.name
        if item.is_dir(): copy_overlay(item, dest)
        else: shutil.copy2(item, dest)

app = Path('/home/jeblast/repos/doran-whatsapp-server')
stamp = str(int(time.time()))
stage = app.parent / ('.doran-request-job-id-' + stamp)
backup = Path('/home/jeblast/backups') / ('doran-request-job-id-' + stamp)
incoming = Path('/home/jeblast/request-job-id-20261011.zip')
node_path = '/home/jeblast/.local/share/doran-node/node-v24.21.0-linux-x64/bin'
os.environ['PATH'] = node_path + ':' + os.environ['PATH']
assert app.is_dir() and not stage.exists() and not backup.exists()
backup.mkdir(mode=0o700)
stage.mkdir(mode=0o700)
print('BACKUP', backup, flush=True)
build_before = (app / '.next/BUILD_ID').read_text()
with zipfile.ZipFile(incoming) as archive:
    manifest = json.loads(archive.read('manifest.json'))
    for name in manifest:
        assert not Path(name).is_absolute() and '..' not in Path(name).parts
    source_before = {}
    for name in manifest:
        live = app / name
        source_before[name] = hashlib.sha256(live.read_bytes()).hexdigest() if live.exists() else None
        if live.exists():
            target = backup / 'source' / name
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(live, target)
    for name in ['src','public','prisma','deployment','package.json','package-lock.json','next.config.js','next-i18next.config.js','tsconfig.json','tsconfig.server.json','.eslintrc.json','ecosystem.config.js']:
        source, target = app / name, stage / name
        if source.is_dir(): shutil.copytree(source, target)
        else: shutil.copy2(source, target)
    shutil.copy2(app / '.env', stage / '.env')
    # Isolate generated Prisma Client while reusing unchanged dependencies.
    modules = stage / 'node_modules'
    modules.mkdir()
    for child in (app / 'node_modules').iterdir():
        target = modules / child.name
        if child.name == '.prisma': shutil.copytree(child, target)
        elif child.name == '@prisma':
            target.mkdir()
            for package in child.iterdir():
                if package.name == 'client': shutil.copytree(package, target / package.name)
                else: (target / package.name).symlink_to(package, target_is_directory=package.is_dir())
        else: target.symlink_to(child, target_is_directory=child.is_dir())
    for name, digest in manifest.items():
        content = archive.read(name)
        assert hashlib.sha256(content).hexdigest() == digest
        target = stage / name
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(content)
(backup / 'manifest.json').write_text(json.dumps(manifest))
(backup / 'source-before.json').write_text(json.dumps(source_before))
env = dict(os.environ, WHATSAPP_ENABLED='false', DISPATCH_QUEUE_ENABLED='false', QUEUE_ENABLED='false', NODE_OPTIONS='--max-old-space-size=8192')
with (backup / 'build.log').open('w') as log:
    for command in [['node','node_modules/prisma/build/index.js','generate'], ['node','deployment/verify-request-job-id.cjs'], ['node','deployment/verify-send-response.cjs'], ['node','deployment/verify-api-toolkit.cjs'], ['npm','run','build']]:
        try: subprocess.run(command, cwd=stage, env=env, stdout=log, stderr=subprocess.STDOUT, check=True)
        except Exception:
            print((backup / 'build.log').read_text()[-12000:], flush=True)
            raise
print('ISOLATED_BUILD_AND_TESTS_PASSED', flush=True)
assert (app / '.next/BUILD_ID').read_text() == build_before, 'Concurrent deployment detected'
for name, digest in source_before.items():
    live = app / name
    assert (hashlib.sha256(live.read_bytes()).hexdigest() if live.exists() else None) == digest, 'Concurrent source change: ' + name
def pm2(*args):
    return subprocess.run(['/usr/local/bin/pm2', *args], cwd=app, check=True, stdout=subprocess.PIPE).stdout
def processes(): return {p['name']: p for p in json.loads(pm2('jlist'))}
def ready():
    for _ in range(45):
        try:
            if urllib.request.urlopen('http://127.0.0.1:3000/signin', timeout=3).status == 200: return True
        except Exception: pass
        time.sleep(1)
    return False
before = processes()
telegram_pid = before['telegram-sender']['pid']
old = backup / 'runtime'
old.mkdir(mode=0o700)
moved_old, moved_new = [], []
client = app / 'node_modules/.prisma/client'
shutil.copytree(client, backup / 'prisma-client-before')
migrated = False
pm2('stop', 'doran-whatsapp')
try:
    # Credentials remain in memory; dump contents and logs stay private.
    dump_js = """require('@next/env').loadEnvConfig(process.cwd());const{spawnSync}=require('node:child_process');const u=new URL(process.env.DATABASE_URL);
const r=spawnSync('/usr/bin/mysqldump',['--single-transaction','--quick','--skip-lock-tables','--host='+u.hostname,'--port='+(u.port||'3306'),'--user='+decodeURIComponent(u.username),decodeURIComponent(u.pathname.slice(1))],{env:{...process.env,MYSQL_PWD:decodeURIComponent(u.password)},stdio:['ignore',1,'pipe']});
if(r.status!==0){console.error('Database backup failed; diagnostics withheld');process.exit(1)}"""
    with (backup / 'database-before.sql').open('wb') as out:
        os.chmod(backup / 'database-before.sql', 0o600)
        subprocess.run(['node','-e',dump_js], cwd=app, stdout=out, check=True)
    assert (backup / 'database-before.sql').stat().st_size > 0
    with (backup / 'migration.log').open('w') as log:
        subprocess.run(['node','node_modules/prisma/build/index.js','migrate','deploy'], cwd=stage, stdout=log, stderr=subprocess.STDOUT, check=True)
    migrated = True
    print('DATABASE_BACKUP_AND_MIGRATION_PASSED', flush=True)
    copy_overlay(stage / 'node_modules/.prisma/client', client)
    subprocess.run(['node','deployment/verify-request-job-id-db.cjs'], cwd=stage, check=True)
    for name in ['.next','dist']:
        (app / name).rename(old / name); moved_old.append(name)
        (stage / name).rename(app / name); moved_new.append(name)
    for name in manifest:
        target = app / name; target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(stage / name, target)
    pm2('startOrReload','ecosystem.config.js','--only','doran-whatsapp','--update-env')
    assert ready(), 'Startup failed'
    for script in ['verify-request-job-id-live.cjs','verify-device-api-parity-live.cjs','verify-marketing-live.cjs','verify-api-toolkit-live.cjs']:
        subprocess.run(['node','deployment/' + script], cwd=app, check=True)
    after = processes()
    assert after['telegram-sender']['pid'] == telegram_pid
    assert after['doran-whatsapp']['pm2_env']['status'] == 'online'
    assert after['doran-whatsapp']['pm2_env']['DISPATCH_QUEUE_ENABLED'] == 'true'
    assert after['doran-whatsapp']['pm2_env']['WHATSAPP_ENABLED'] == 'true'
    for name, digest in manifest.items(): assert hashlib.sha256((app / name).read_bytes()).hexdigest() == digest, name
except Exception:
    pm2('stop','doran-whatsapp')
    for name in moved_new: (app / name).rename(stage / name)
    for name in moved_old: (old / name).rename(app / name)
    copy_overlay(backup / 'prisma-client-before', client)
    for name, digest in source_before.items():
        # Keep the additive schema and migration history after a runtime rollback.
        if migrated and name.startswith('prisma/'):
            target = app / name; target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(stage / name, target)
            continue
        if digest is None:
            if (app / name).is_file(): (app / name).unlink()
        else: shutil.copy2(backup / 'source' / name, app / name)
    pm2('startOrReload','ecosystem.config.js','--only','doran-whatsapp','--update-env')
    print('ROLLED_BACK', backup, flush=True)
    raise
pm2('save')
print('DEPLOYED_REQUEST_JOB_ID', (app / '.next/BUILD_ID').read_text().strip(), flush=True)
print('BACKUP', backup, flush=True)

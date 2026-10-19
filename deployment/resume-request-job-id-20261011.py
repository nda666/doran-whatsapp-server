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
stamp = '1791680386'
stage = app.parent / ('.doran-request-job-id-' + stamp)
backup = Path('/home/jeblast/backups') / ('doran-request-job-id-' + stamp)
incoming = Path('/home/jeblast/request-job-id-20261011.zip')
node_path = '/home/jeblast/.local/share/doran-node/node-v24.21.0-linux-x64/bin'
os.environ['PATH'] = node_path + ':' + os.environ['PATH']
manifest = json.loads((backup / 'manifest.json').read_text())
source_before = json.loads((backup / 'source-before.json').read_text())
assert (stage / '.next/BUILD_ID').is_file()
assert (backup / 'database-before.sql').stat().st_size > 0
for name, digest in source_before.items():
    live = app / name
    assert (hashlib.sha256(live.read_bytes()).hexdigest() if live.exists() else None) == digest, name
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
old.mkdir(mode=0o700, exist_ok=True)
moved_old, moved_new = [], []
client = app / 'node_modules/.prisma/client'
assert (backup / 'prisma-client-before').is_dir()
migrated = True
pm2('stop', 'doran-whatsapp')
try:
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

"""Promote the verified user approval build; retain the production database and sessions."""
from pathlib import Path
import hashlib
import json
import os
import shutil
import subprocess
import time
import urllib.request

app = Path('/home/jeblast/repos/doran-whatsapp-server').resolve()
stage = Path('/home/jeblast/repos/.doran-user-approval-20261010').resolve()
backup = Path('/home/jeblast/backups/doran-user-approval-20261010').resolve()
assert app.parent == stage.parent == Path('/home/jeblast/repos')
assert backup.parent == Path('/home/jeblast/backups')
assert (stage / '.next/BUILD_ID').is_file()
assert (stage / 'dist/src/server/index.js').is_file()
assert (backup / 'source-before.tar.gz').stat().st_size > 0
os.environ['PATH'] = '/home/jeblast/.local/share/doran-node/node-v24.21.0-linux-x64/bin:' + os.environ['PATH']

def pm2(*args):
    return subprocess.run(['/usr/local/bin/pm2'] + list(args), cwd=str(app), check=True, stdout=subprocess.PIPE)

def processes():
    return {entry['name']: entry for entry in json.loads(pm2('jlist').stdout)}

def ready():
    for _ in range(40):
        try:
            with urllib.request.urlopen('http://127.0.0.1:3000/signin', timeout=3) as response:
                if response.status == 200:
                    return True
        except Exception:
            pass
        time.sleep(1)
    return False

manifest = json.loads((stage / 'approval-source-manifest.json').read_text())
for name, digest in manifest.items():
    assert hashlib.sha256((stage / name).read_bytes()).hexdigest() == digest
changed = [name for name,digest in manifest.items() if not (app/name).is_file() or hashlib.sha256((app/name).read_bytes()).hexdigest() != digest]
(backup/'changed-files.json').write_text(json.dumps(changed))
before = processes()
telegram_pid = before['telegram-sender']['pid']
for flag, value in [('WHATSAPP_ENABLED', 'true'), ('DISPATCH_QUEUE_ENABLED', 'true'), ('QUEUE_ENABLED', 'false')]:
    assert before['doran-whatsapp']['pm2_env'][flag] == value
previous = backup / 'previous-runtime'
assert not previous.exists() or not any(previous.iterdir())
previous.mkdir(mode=0o700, exist_ok=True)
old_source = backup / 'changed-source-before'
old_source.mkdir(mode=0o700, exist_ok=True)
existing = []
for name in changed:
    if (app / name).is_file():
        target = old_source / name
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(str(app / name), str(target))
        existing.append(name)
(backup / 'existing-files.json').write_text(json.dumps(existing))
moved_old, moved_new = [], []
if 'doran-approval-check' in before:
    pm2('delete', 'doran-approval-check')
pm2('stop', 'doran-whatsapp')
try:
    for name in ['.next', 'dist', 'node_modules']:
        os.rename(str(app / name), str(previous / name))
        moved_old.append(name)
        os.rename(str(stage / name), str(app / name))
        moved_new.append(name)
    for name in changed:
        (app / name).parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(str(stage / name), str(app / name))
    for name in ['verify-user-approval.cjs', 'verify-user-approval-live.cjs']:
        shutil.copy2(str(stage/'deployment'/name), str(app/'deployment'/name))
    pm2('startOrReload', 'ecosystem.config.js', '--only', 'doran-whatsapp', '--update-env')
    assert ready(), 'New build failed startup'
    subprocess.run(['node', 'deployment/verify-marketing-live.cjs'], cwd=str(app), check=True)
    subprocess.run(['node', 'deployment/verify-user-approval-live.cjs'], cwd=str(app), check=True)
    after = processes()
    assert after['telegram-sender']['pid'] == telegram_pid
    assert after['doran-whatsapp']['pm2_env']['status'] == 'online'
    for name, digest in manifest.items():
        assert hashlib.sha256((app / name).read_bytes()).hexdigest() == digest, name
except Exception:
    pm2('stop', 'doran-whatsapp')
    # Legacy authentication cannot safely serve newly pending accounts.
    check = subprocess.run(['node','-e',"require('@next/env').loadEnvConfig(process.cwd());const{PrismaClient}=require('@prisma/client');const p=new PrismaClient();p.user.count({where:{approvalStatus:{not:'APPROVED'}}}).then(n=>{process.exitCode=n?1:0}).finally(()=>p.$disconnect())"],cwd=str(app))
    if check.returncode:
        print('ROLLBACK_BLOCKED_PENDING_ACCOUNTS_FAIL_CLOSED_REPAIR_REQUIRED',flush=True)
        raise
    for name in moved_new:
        os.rename(str(app / name), str(stage / name))
    for name in moved_old:
        os.rename(str(previous / name), str(app / name))
    for name in changed:
        if name in existing:
            shutil.copy2(str(old_source / name), str(app / name))
        elif (app / name).is_file():
            (app / name).unlink()
    pm2('startOrReload', 'ecosystem.config.js', '--only', 'doran-whatsapp', '--update-env')
    print('APPROVAL_RUNTIME_ROLLED_BACK_ADDITIVE_COLUMN_PRESERVED', flush=True)
    raise
pm2('save')
print('USER_APPROVAL_DEPLOYED_ALL_SOURCE_HASHES_MATCH_TELEGRAM_PID_UNCHANGED', flush=True)
print('BACKUP', str(backup), flush=True)

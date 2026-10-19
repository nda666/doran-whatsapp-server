"""Promote the verified UI build; retain the production database and sessions."""
from pathlib import Path
import hashlib
import json
import os
import shutil
import subprocess
import time
import urllib.request

app = Path('/home/jeblast/repos/doran-whatsapp-server').resolve()
stage = Path('/home/jeblast/repos/.doran-api-toolkit-20261010').resolve()
backup = Path('/home/jeblast/backups/doran-api-toolkit-20261010').resolve()
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

manifest = json.loads((stage / 'ui-source-manifest.json').read_text())
for name, digest in manifest.items():
    assert hashlib.sha256((stage / name).read_bytes()).hexdigest() == digest
changed = json.loads((backup / 'changed-files.json').read_text())
before = processes()
telegram_pid = before['telegram-sender']['pid']
for flag, value in [('WHATSAPP_ENABLED', 'true'), ('DISPATCH_QUEUE_ENABLED', 'true'), ('QUEUE_ENABLED', 'false')]:
    assert before['doran-whatsapp']['pm2_env'][flag] == value
assert (app / '.next/BUILD_ID').read_text() == (backup / 'build-id-before').read_text(), 'Concurrent deployment detected'
previous = backup / 'previous-runtime'
assert not previous.exists()
previous.mkdir(mode=0o700)
old_source = backup / 'changed-source-before'
old_source.mkdir(mode=0o700)
existing = []
for name in changed:
    if (app / name).is_file():
        target = old_source / name
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(str(app / name), str(target))
        existing.append(name)
(backup / 'existing-files.json').write_text(json.dumps(existing))
moved_old, moved_new = [], []
pm2('stop', 'doran-whatsapp')
try:
    for name in ['.next', 'dist']:
        os.rename(str(app / name), str(previous / name))
        moved_old.append(name)
        os.rename(str(stage / name), str(app / name))
        moved_new.append(name)
    for name in changed:
        (app / name).parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(str(stage / name), str(app / name))
    pm2('startOrReload', 'ecosystem.config.js', '--only', 'doran-whatsapp', '--update-env')
    assert ready(), 'New build failed startup'
    subprocess.run(['node', 'deployment/verify-marketing-live.cjs'], cwd=str(app), check=True)
    subprocess.run(['node', 'deployment/verify-api-toolkit-live.cjs'], cwd=str(app), check=True)
    after = processes()
    assert after['telegram-sender']['pid'] == telegram_pid
    assert after['doran-whatsapp']['pm2_env']['status'] == 'online'
    for name, digest in manifest.items():
        assert hashlib.sha256((app / name).read_bytes()).hexdigest() == digest, name
except Exception:
    pm2('stop', 'doran-whatsapp')
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
    print('UI_ROLLED_BACK', flush=True)
    raise
pm2('save')
print('API_TOOLKIT_DEPLOYED_HASHES_MATCH_TELEGRAM_PID_UNCHANGED', flush=True)
print('BACKUP', str(backup), flush=True)

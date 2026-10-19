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

app = Path('/home/jeblast/repos/doran-whatsapp-server')
stamp = str(int(time.time()))
stage = app.parent / ('.doran-approval-notifications-' + stamp)
backup = Path('/home/jeblast/backups') / ('doran-approval-notifications-' + stamp)
incoming = Path('/home/jeblast/approval-notifications-20261012.zip')
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
    baseline = json.loads(archive.read('baseline.json'))
    for name, expected in baseline.items():
        live = app / name
        actual = hashlib.sha256(live.read_bytes()).hexdigest() if live.exists() else None
        assert actual == expected, 'Live source differs from baseline: ' + name
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
    (stage / 'node_modules').symlink_to(app / 'node_modules', target_is_directory=True)
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
    for command in [['node','deployment/verify-approval-notifications.cjs'], ['node','deployment/verify-super-admin-access.cjs'], ['npm','run','build']]:
        try: subprocess.run(command, cwd=stage, env=env, stdout=log, stderr=subprocess.STDOUT, check=True)
        except Exception:
            print((backup / 'build.log').read_text()[-12000:], flush=True)
            raise
print('ISOLATED_BUILD_AND_TESTS_PASSED', flush=True)
if '--prepare-only' in sys.argv:
    print('PREPARED_ONLY_NO_PRODUCTION_RELOAD', stage, flush=True)
    print('BACKUP', backup, flush=True)
    sys.exit(0)
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
pm2('stop', 'doran-whatsapp')
try:
    for name in ['.next','dist']:
        (app / name).rename(old / name); moved_old.append(name)
        (stage / name).rename(app / name); moved_new.append(name)
    for name in manifest:
        target = app / name; target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(stage / name, target)
    pm2('startOrReload','ecosystem.config.js','--only','doran-whatsapp','--update-env')
    assert ready(), 'Startup failed'
    for script in ['verify-approval-notifications-live.cjs']:
        subprocess.run(['node','deployment/' + script], cwd=app, check=True)
    after = processes()
    assert after['telegram-sender']['pid'] == telegram_pid
    assert after['doran-whatsapp']['pm2_env']['status'] == 'online'
    for flag in ['DISPATCH_QUEUE_ENABLED','WHATSAPP_ENABLED','QUEUE_ENABLED']:
        assert after['doran-whatsapp']['pm2_env'].get(flag) == before['doran-whatsapp']['pm2_env'].get(flag), flag
    for name, digest in manifest.items(): assert hashlib.sha256((app / name).read_bytes()).hexdigest() == digest, name
except Exception:
    pm2('stop','doran-whatsapp')
    for name in moved_new: (app / name).rename(stage / name)
    for name in moved_old: (old / name).rename(app / name)
    for name, digest in source_before.items():
        if digest is None:
            if (app / name).is_file(): (app / name).unlink()
        else: shutil.copy2(backup / 'source' / name, app / name)
    pm2('startOrReload','ecosystem.config.js','--only','doran-whatsapp','--update-env')
    print('ROLLED_BACK', backup, flush=True)
    raise
pm2('save')
print('DEPLOYED_APPROVAL_NOTIFICATIONS', (app / '.next/BUILD_ID').read_text().strip(), flush=True)
print('BACKUP', backup, flush=True)

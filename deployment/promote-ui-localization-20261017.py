"""Promote the verified isolated build with source checks and automatic rollback."""
from pathlib import Path
import hashlib, json, os, shutil, subprocess, sys, time, urllib.request
sys.path.insert(0, '/home/jeblast/repos/doran-whatsapp-server/deployment')
from stage_cleanup import StageCleanup
metadata=json.loads(Path('/home/jeblast/localization-prepared.json').read_text())
app=Path(metadata['app']); stage=Path(metadata['stage']); backup=Path(metadata['backup'])
assert app == Path('/home/jeblast/repos/doran-whatsapp-server')
assert stage.parent == app.parent and stage.name.startswith('.doran-localization-')
assert backup.parent == Path('/home/jeblast/backups') and backup.name.startswith('doran-localization-')
os.environ['PATH']='/home/jeblast/.local/share/doran-node/node-v24.21.0-linux-x64/bin:'+os.environ['PATH']
build_before=metadata['build_before']; manifest=metadata['manifest']; source_before=metadata['source_before']
stage_cleanup=StageCleanup(app.parent, stage)
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
stage_cleanup.preserve = True
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
    for name, digest in source_before.items():
        if digest is None:
            if (app / name).is_file(): (app / name).unlink()
        else: shutil.copy2(backup / 'source' / name, app / name)
    pm2('startOrReload','ecosystem.config.js','--only','doran-whatsapp','--update-env')
    assert ready(), 'Rollback startup failed'
    stage_cleanup.preserve = False
    print('ROLLED_BACK', backup, flush=True)
    raise
stage_cleanup.preserve = False
stage_cleanup.cleanup()
pm2('save')
(backup / 'SUCCESS.json').write_text(json.dumps({'active_build': (app / '.next/BUILD_ID').read_text().strip(), 'previous_build': build_before.strip()}))
# Preserve existing backups; retention is outside this change.
print('DEPLOYED_UI_LOCALIZATION', (app / '.next/BUILD_ID').read_text().strip(), flush=True)
print('BACKUP', backup, flush=True)




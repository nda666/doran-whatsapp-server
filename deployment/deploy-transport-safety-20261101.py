"""Isolated transport-safety build, private backups and reversible runtime promotion; no schema/settings mutation."""
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

APP = Path('/home/jeblast/repos/doran-whatsapp-server')
NODE_BIN = '/home/jeblast/.local/share/doran-node/node-v24.21.0-linux-x64/bin'
os.environ['PATH'] = NODE_BIN + ':' + os.environ['PATH']
stamp = str(int(time.time()))
stage = APP.parent / ('.doran-transport-safety-' + stamp)
backup = Path('/home/jeblast/backups') / ('doran-transport-safety-' + stamp)
assert APP.is_dir() and not stage.exists() and not backup.exists()
backup.mkdir(mode=0o700)
stage.mkdir(mode=0o700)
print('BACKUP', backup, flush=True)
base_env = dict(os.environ)
build_env = dict(base_env, WHATSAPP_ENABLED='false', QUEUE_ENABLED='false', DISPATCH_QUEUE_ENABLED='false', NODE_OPTIONS='--max-old-space-size=8192')
log = (backup / 'build-and-checks.log').open('w')
def run(args, cwd=stage, env=build_env, capture=False):
    result = subprocess.run(args, cwd=cwd, env=env, check=True, stdout=subprocess.PIPE if capture else log, stderr=log)
    log.flush()
    return result.stdout if capture else None
def pm2(*args):
    return json.loads(subprocess.check_output(['/usr/local/bin/pm2', 'jlist'], cwd=APP)) if args == ('jlist',) else subprocess.check_output(['/usr/local/bin/pm2', *args], cwd=APP)
def ready():
    for _ in range(60):
        try:
            if urllib.request.urlopen('http://127.0.0.1:3000/signin', timeout=3).status == 200:
                return True
        except Exception:
            pass
        time.sleep(1)
    return False

with zipfile.ZipFile('/home/jeblast/transport-safety-20261101.zip') as archive:
    manifest = json.loads(archive.read('manifest.json'))
    baseline = json.loads(archive.read('baseline.json'))
    for name in manifest:
        assert not Path(name).is_absolute() and '..' not in Path(name).parts
        target = APP / name
        actual = hashlib.sha256(target.read_bytes()).hexdigest() if target.is_file() else None
        assert actual == baseline[name], 'Concurrent source change: ' + name
        if target.is_file():
            old = backup / 'source' / name
            old.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(target, old)
    active_build = (APP / '.next/BUILD_ID').read_bytes()
    for name in ['src', 'public', 'prisma', 'deployment']:
        shutil.copytree(APP / name, stage / name, symlinks=True,
                        ignore=shutil.ignore_patterns('*.zip', '*.log', 'uploads', 'downloads', '__pycache__'))
    for name in ['package.json', 'package-lock.json', 'next.config.js', 'next-i18next.config.js', 'tsconfig.json', 'tsconfig.server.json', '.eslintrc.json', 'ecosystem.config.js', '.env']:
        shutil.copy2(APP / name, stage / name)
    subprocess.run(['cp', '-a', '--reflink=auto', str(APP / 'node_modules'), str(stage / 'node_modules')], check=True)
    for name, digest in manifest.items():
        content = archive.read(name)
        assert hashlib.sha256(content).hexdigest() == digest
        target = stage / name
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(content)
(backup / 'manifest.json').write_text(json.dumps(manifest))
(backup / 'source-before.json').write_text(json.dumps(baseline))
try:
    run(['npx', '--no-install', 'prisma', 'generate'])
    run(['npm', 'run', 'build'])
    run(['node', 'deployment/ci-tests.cjs'])
    run(['node', 'deployment/verify-transport-mysql.cjs'])
    print('ISOLATED_PRODUCTION_BUILD_AND_REGRESSION_PASSED', flush=True)

except Exception:
    print('BUILD_OR_PREFLIGHT_FAILED; LIVE_RUNTIME_UNCHANGED', flush=True)
    print((backup / 'build-and-checks.log').read_text()[-5000:], flush=True)
    raise

assert (APP / '.next/BUILD_ID').read_bytes() == active_build
for name, digest in baseline.items():
    target = APP / name
    assert (hashlib.sha256(target.read_bytes()).hexdigest() if target.is_file() else None) == digest, 'Concurrent source change: ' + name
before_processes = {row['name']: row for row in pm2('jlist')}
unrelated = {name: row['pid'] for name, row in before_processes.items() if name != 'doran-whatsapp'}
old_runtime = backup / 'runtime'
old_runtime.mkdir(mode=0o700)
moved = []
pm2('stop', 'doran-whatsapp')
print('APPLICATION_DRAINED; PRIVATE_BACKUP_STARTED', flush=True)
try:
    run(['node', 'deployment/cd-database.cjs', 'dump', str(backup / 'database.sql')], cwd=APP, env=base_env)
    sys.path.insert(0, str(APP / 'deployment'))
    from private_snapshot import create_snapshot
    label = 'transport-safety-' + stamp
    (backup / 'commit.txt').write_text(label + '\n')
    snapshot = create_snapshot(APP, Path('/home/jeblast/backups/private-snapshots'), label)
    (backup / 'private-snapshot.json').write_text(json.dumps({'path': str(snapshot)}))
    for name in ['.next', 'dist']:
        (APP / name).rename(old_runtime / name)
        moved.append(name)
        (stage / name).rename(APP / name)
    for name in manifest:
        target = APP / name
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(stage / name, target)
    pm2('startOrReload', 'ecosystem.config.js', '--only', 'doran-whatsapp', '--update-env')
    assert ready(), 'New runtime did not start'
    for name, digest in manifest.items():
        assert hashlib.sha256((APP / name).read_bytes()).hexdigest() == digest, name
    after_processes = {row['name']: row for row in pm2('jlist')}
    assert after_processes['doran-whatsapp']['pm2_env']['status'] == 'online'
    for name, pid in unrelated.items():
        assert after_processes[name]['pid'] == pid, 'Unrelated process changed: ' + name
    result = {'backup': str(backup), 'build': (APP / '.next/BUILD_ID').read_text().strip(), 'deployed_at_utc': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()), 'files': len(manifest)}
    (backup / 'SUCCESS.json').write_text(json.dumps(result))
    print('DEPLOYED', json.dumps(result), flush=True)
except Exception:
    pm2('stop', 'doran-whatsapp')
    for name in reversed(moved):
        if (APP / name).exists():
            (APP / name).rename(stage / name)
        (old_runtime / name).rename(APP / name)
    for name, digest in baseline.items():
        target = APP / name
        if digest is None:
            if target.is_file():
                target.unlink()
        else:
            shutil.copy2(backup / 'source' / name, target)
    pm2('startOrReload', 'ecosystem.config.js', '--only', 'doran-whatsapp', '--update-env')
    print('ROLLED_BACK_RUNTIME', ready(), flush=True)
    print((backup / 'build-and-checks.log').read_text()[-5000:], flush=True)
    raise
finally:
    log.close()

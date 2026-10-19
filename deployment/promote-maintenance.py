from pathlib import Path
import hashlib
import os
import shutil
import subprocess
import tarfile
import time
import urllib.request

app = Path('/home/jeblast/repos/doran-whatsapp-server')
stage = Path('/home/jeblast/repos/.doran-maintenance-20261009')
backup = Path('/home/jeblast/backups/doran-maintenance-20261009')
assert (stage / '.next/BUILD_ID').is_file()
assert app.parent == stage.parent == Path('/home/jeblast/repos')
# Abort if another operator changed live source since the backup was taken.
with tarfile.open(str(backup / 'source-before.tar.gz')) as archive:
    for entry in archive.getmembers():
        if entry.isfile() and entry.name.startswith('src/'):
            original = archive.extractfile(entry).read()
            current = (app / entry.name).read_bytes()
            assert hashlib.sha256(original).digest() == hashlib.sha256(current).digest(), entry.name + ' changed concurrently'
for name in ['package.json', 'package-lock.json']:
    assert (backup / name).read_bytes() == (app / name).read_bytes(), name + ' changed concurrently'

def pm2(*args):
    subprocess.run(['/usr/local/bin/pm2'] + list(args), check=True, cwd=str(app))

pm2('delete', 'doran-maintenance-check')
previous = backup / 'previous-runtime'
previous.mkdir()
names = ['node_modules', '.next', 'dist', 'src']
old_moved, new_moved = [], []
pm2('stop', 'doran-whatsapp')
try:
    for name in names:
        os.rename(str(app / name), str(previous / name))
        old_moved.append(name)
        os.rename(str(stage / name), str(app / name))
        new_moved.append(name)
    for name in ['package.json', 'package-lock.json']:
        shutil.copy2(str(stage / name), str(app / name))
    for name in ['maintenance.cjs', 'run-maintenance.sh', 'verify-maintenance.cjs']:
        shutil.copy2(str(stage / 'deployment' / name), str(app / 'deployment' / name))
    pm2('startOrReload', 'ecosystem.config.js', '--only', 'doran-whatsapp', '--update-env')
    ready = False
    for attempt in range(20):
        try:
            with urllib.request.urlopen('http://127.0.0.1:3000/signin', timeout=5) as r:
                ready = r.status == 200
        except Exception:
            pass
        if ready:
            break
        time.sleep(1)
    if not ready:
        raise RuntimeError('Dashboard health check failed')
except Exception:
    pm2('stop', 'doran-whatsapp')
    for name in new_moved:
        os.rename(str(app / name), str(stage / name))
    for name in old_moved:
        os.rename(str(previous / name), str(app / name))
    for name in ['package.json', 'package-lock.json']:
        shutil.copy2(str(backup / name), str(app / name))
    pm2('startOrReload', 'ecosystem.config.js', '--only', 'doran-whatsapp', '--update-env')
    raise
pm2('save')
print('MAINTENANCE_UPGRADE_PROMOTED')

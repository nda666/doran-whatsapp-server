from pathlib import Path
import json
import os
import shutil
import subprocess
import tarfile
import time
import urllib.request

app = Path('/home/jeblast/repos/doran-whatsapp-server')
stage = Path('/home/jeblast/repos/.doran-tooling-20261009')
backup = Path('/home/jeblast/backups/doran-tooling-20261009')
assert app.parent == stage.parent == Path('/home/jeblast/repos')
assert json.loads((stage / 'deployment/npm-audit-all.json').read_text())['metadata']['vulnerabilities']['total'] == 0
with tarfile.open(str(backup / 'config-before.tar.gz')) as archive:
    for name in ['package.json', 'package-lock.json']:
        assert archive.extractfile(name).read() == (app / name).read_bytes(), 'Concurrent config change: ' + name
previous = backup / 'previous-node_modules'
assert not previous.exists()
files = ['run-typescript.cjs', 'watch-typescript.cjs', 'verify-tooling.cjs', 'npm-audit-all.json']

def pm2(*args):
    subprocess.run(['/usr/local/bin/pm2'] + list(args), check=True, cwd=str(app))

pm2('stop', 'doran-whatsapp')
os.rename(str(app / 'node_modules'), str(previous))
try:
    os.rename(str(stage / 'node_modules'), str(app / 'node_modules'))
    for name in ['package.json', 'package-lock.json']:
        shutil.copy2(str(stage / name), str(app / name))
    for name in files:
        shutil.copy2(str(stage / 'deployment' / name), str(app / 'deployment' / name))
    (app / 'nodemon.json').unlink()
    pm2('startOrReload', 'ecosystem.config.js', '--only', 'doran-whatsapp', '--update-env')
    ready = False
    for _ in range(20):
        try:
            with urllib.request.urlopen('http://127.0.0.1:3000/signin', timeout=5) as r:
                ready = r.status == 200
        except Exception:
            pass
        if ready:
            break
        time.sleep(1)
    if not ready:
        raise RuntimeError('Dashboard did not become ready')
except Exception:
    pm2('stop', 'doran-whatsapp')
    if (app / 'node_modules').exists():
        os.rename(str(app / 'node_modules'), str(stage / 'node_modules'))
    os.rename(str(previous), str(app / 'node_modules'))
    subprocess.run(['tar', '-xzf', str(backup / 'config-before.tar.gz'), '-C', str(app)], check=True)
    pm2('startOrReload', 'ecosystem.config.js', '--only', 'doran-whatsapp', '--update-env')
    raise
pm2('save')
print('TOOLING_DEPLOYED_AND_DASHBOARD_HEALTHY')

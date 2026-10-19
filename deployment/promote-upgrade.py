from pathlib import Path
import json
import os
import shutil
import subprocess
import time
import urllib.request

app = Path('/home/jeblast/repos/doran-whatsapp-server').resolve()
stage = Path('/home/jeblast/repos/.doran-maintenance-20261009').resolve()
backup = Path('/home/jeblast/backups/doran-update-20261009').resolve()
assert app.parent == stage.parent == Path('/home/jeblast/repos')
assert (backup / 'runtime-before.tar.gz').stat().st_size > 0
assert (stage / '.next/BUILD_ID').is_file()
assert json.loads((stage / 'node_modules/@whiskeysockets/baileys/package.json').read_text())['version'] == '7.0.0-rc14'

runtime = ['node_modules', '.next', 'dist']
files = ['package.json', 'package-lock.json', 'next.config.js', 'tsconfig.json', 'tsconfig.server.json', 'next-env.d.ts',
         'src/server/index.ts', 'src/server/libs/makeWASocket.ts', 'src/server/events/connectionUpdate.ts']
previous = backup / 'previous-runtime'
previous.mkdir()

def pm2(*args):
    subprocess.run(['/usr/local/bin/pm2'] + list(args), check=True, cwd=str(app))

pm2('delete', 'doran-upgrade-check')
pm2('stop', 'doran-whatsapp')
moved_old = []
moved_new = []
try:
    for name in runtime:
        os.rename(str(app / name), str(previous / name))
        moved_old.append(name)
        os.rename(str(stage / name), str(app / name))
        moved_new.append(name)
    for name in files:
        shutil.copy2(str(stage / name), str(app / name))
    shutil.copy2(str(stage / 'deployment/verify-upgrade.cjs'), str(app / 'deployment/verify-upgrade.cjs'))
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
        raise RuntimeError('Updated dashboard did not become ready')
except Exception:
    pm2('stop', 'doran-whatsapp')
    for name in moved_new:
        os.rename(str(app / name), str(stage / name))
    for name in moved_old:
        os.rename(str(previous / name), str(app / name))
    subprocess.run(['tar', '-xzf', str(backup / 'config-source-before.tar.gz'), '-C', str(app)], check=True)
    pm2('startOrReload', 'ecosystem.config.js', '--only', 'doran-whatsapp', '--update-env')
    raise

pm2('save')
p = Path('/home/jeblast/.pm2/dump.pm2')
current = json.loads(p.read_text())
old = json.loads((backup / 'pm2-dump-before.json').read_text())
names = {entry['name'] for entry in current}
current.extend(entry for entry in old if entry['name'] not in names)
p.write_text(json.dumps(current, indent=2) + '\n')
p.chmod(0o600)
print('UPGRADE_PROMOTED_AND_LOCAL_LOGIN_OK')

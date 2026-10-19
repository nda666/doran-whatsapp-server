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
sys.path.insert(0, '/home/jeblast/repos/doran-whatsapp-server/deployment')
from stage_cleanup import StageCleanup
from backup_retention import prune_deploy_backups

app = Path('/home/jeblast/repos/doran-whatsapp-server')
stamp = str(int(time.time()))
stage = app.parent / ('.doran-localization-' + stamp)
backup = Path('/home/jeblast/backups') / ('doran-localization-' + stamp)
incoming = Path('/home/jeblast/localization-20261017.zip')
node_path = '/home/jeblast/.local/share/doran-node/node-v24.21.0-linux-x64/bin'
os.environ['PATH'] = node_path + ':' + os.environ['PATH']
assert app.is_dir() and not stage.exists() and not backup.exists()
backup.mkdir(mode=0o700)
stage.mkdir(mode=0o700)
stage_cleanup = StageCleanup(app.parent, stage)
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
    for command in [['npm','run','build']]:
        try: subprocess.run(command, cwd=stage, env=env, stdout=log, stderr=subprocess.STDOUT, check=True)
        except Exception:
            print((backup / 'build.log').read_text()[-12000:], flush=True)
            raise
print('ISOLATED_BUILD_AND_TESTS_PASSED', flush=True)
stage_cleanup.preserve = True
metadata = {'app':str(app),'stage':str(stage),'backup':str(backup),'build_before':build_before,'manifest':manifest,'source_before':source_before}
Path('/home/jeblast/localization-prepared.json').write_text(json.dumps(metadata))
print('LOCALIZATION_PREPARED', stage, flush=True)

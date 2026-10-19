from pathlib import Path
import hashlib
import json
import os
import shutil
import subprocess
import zipfile

app = Path('/home/jeblast/repos/doran-whatsapp-server').resolve()
stage = Path('/home/jeblast/repos/.doran-phone-label-20261010').resolve()
backup = Path('/home/jeblast/backups/doran-phone-label-20261010').resolve()
assert app.parent == stage.parent == Path('/home/jeblast/repos')
assert backup.parent == Path('/home/jeblast/backups')
assert not (stage / "package.json").exists() and not (backup / "source-before.tar.gz").exists()
stage.mkdir(mode=0o700, exist_ok=True)
backup.mkdir(mode=0o700, exist_ok=True)
with zipfile.ZipFile('/tmp/phone-label-upload-20261010.zip') as z:
    baseline = json.loads(z.read('baseline-source-manifest.json'))
    manifest = json.loads(z.read('ui-source-manifest.json'))
    for name, digest in baseline.items():
        assert hashlib.sha256((app / name).read_bytes()).hexdigest() == digest, name
    for name in z.namelist():
        assert stage in (stage / name).resolve().parents
    subprocess.run(['tar', '-czf', str(backup / 'source-before.tar.gz'), '--exclude=node_modules', '--exclude=.next', '--exclude=dist', '--exclude=storage', '--exclude=.git', '-C', str(app), '.'], check=True)
    (backup / 'build-id-before').write_text((app / '.next/BUILD_ID').read_text())
    (backup / 'changed-files.json').write_text(json.dumps(list(manifest)))
    subprocess.run(['tar', '-xzf', str(backup / 'source-before.tar.gz'), '-C', str(stage)], check=True)
    z.extractall(stage)
os.symlink(str(app / 'node_modules'), str(stage / 'node_modules'))
os.environ['PATH'] = '/home/jeblast/.local/share/doran-node/node-v24.21.0-linux-x64/bin:' + os.environ['PATH']
os.environ['NODE_OPTIONS'] = '--max-old-space-size=8192'
os.environ['WHATSAPP_ENABLED'] = 'false'
os.environ['QUEUE_ENABLED'] = 'false'
subprocess.run(['npm', 'run', 'build'], cwd=stage, check=True)
print('LABEL_BUILD_READY', flush=True)

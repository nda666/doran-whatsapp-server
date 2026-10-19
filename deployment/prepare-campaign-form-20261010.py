from pathlib import Path
import hashlib
import json
import os
import shutil
import subprocess
import tarfile

app = Path('/home/jeblast/repos/doran-whatsapp-server').resolve()
stage = app.parent / '.doran-campaign-form-20261010'
backup = Path('/home/jeblast/backups/doran-campaign-form-20261010')
incoming = Path('/home/jeblast/campaign-form-20261010.tsx')
name = 'src/pages/dashboard/campaigns.tsx'
assert app.is_dir() and not stage.exists() and not backup.exists()
assert hashlib.sha256((app / name).read_bytes()).hexdigest() == 'b152c54a58cd6545dc753b468eaaa61aecd59f61caf626e817d43e1de09b9a6c'
old = (app / name).read_bytes()
incoming.read_bytes().decode('utf-8')
stage.mkdir(mode=0o700)
backup.mkdir(mode=0o700)
(backup / 'build-id-before').write_text((app / '.next/BUILD_ID').read_text())
(backup / 'campaign-before.sha256').write_text(hashlib.sha256(old).hexdigest())
names = ['src', 'public', 'prisma', 'deployment', 'package.json', 'package-lock.json', 'next.config.js', 'next-i18next.config.js', 'tsconfig.json', 'tsconfig.server.json', '.eslintrc.json', 'ecosystem.config.js']
with tarfile.open(backup / 'source-before.tar.gz', 'w:gz') as archive:
    for entry in names:
        archive.add(app / entry, arcname=entry)
for entry in names:
    source, target = app / entry, stage / entry
    if source.is_dir():
        shutil.copytree(source, target)
    else:
        shutil.copy2(source, target)
shutil.copy2(app / '.env', stage / '.env')
(stage / 'node_modules').symlink_to(app / 'node_modules', target_is_directory=True)
shutil.copy2(incoming, stage / name)
manifest = {name: hashlib.sha256((stage / name).read_bytes()).hexdigest()}
(stage / 'ui-source-manifest.json').write_text(json.dumps(manifest))
(backup / 'changed-files.json').write_text(json.dumps(list(manifest)))
env = dict(os.environ, PATH='/home/jeblast/.local/share/doran-node/node-v24.21.0-linux-x64/bin:' + os.environ['PATH'], WHATSAPP_ENABLED='false', DISPATCH_QUEUE_ENABLED='false', QUEUE_ENABLED='false', NODE_OPTIONS='--max-old-space-size=8192')
with (backup / 'build.log').open('w') as log:
    subprocess.run(['npm', 'run', 'build'], cwd=stage, env=env, stdout=log, stderr=subprocess.STDOUT, check=True)
assert (app / '.next/BUILD_ID').read_text() == (backup / 'build-id-before').read_text(), 'Concurrent deployment detected'
assert (app / name).read_bytes() == old, 'Live source changed during build'
print('CAMPAIGN_FORM_STAGED_BUILD_PASSED', flush=True)

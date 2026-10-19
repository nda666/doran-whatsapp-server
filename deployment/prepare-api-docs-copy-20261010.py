from pathlib import Path
import hashlib
import json
import os
import re
import shutil
import subprocess
import tarfile

app = Path('/home/jeblast/repos/doran-whatsapp-server')
stage = app.parent / '.doran-api-docs-copy-20261010'
backup = Path('/home/jeblast/backups/doran-api-docs-copy-20261010')
incoming = Path('/home/jeblast/api-docs-copy-20261010.tsx')
name = 'src/pages/dashboard/api-docs.tsx'
assert app.is_dir() and not stage.exists() and not backup.exists()
old, new = (app / name).read_text(), incoming.read_text()
pattern = r'<Alert type="warning" message="[^"]*" />'
assert len(re.findall(pattern, old)) == len(re.findall(pattern, new)) == 1
assert re.sub(pattern, '', old) == re.sub(pattern, '', new), 'Unexpected changes beyond warning copy'
stage.mkdir(mode=0o700)
backup.mkdir(mode=0o700)
(backup / 'build-id-before').write_text((app / '.next/BUILD_ID').read_text())
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
assert (app / name).read_text() == old, 'Live source changed during build'
print('API_DOCS_COPY_STAGED_BUILD_PASSED', flush=True)

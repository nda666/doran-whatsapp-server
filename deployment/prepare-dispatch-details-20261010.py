from pathlib import Path
import json
import os
import shutil
import subprocess
import tarfile

app = Path('/home/jeblast/repos/doran-whatsapp-server')
stage = app.parent / '.doran-dispatch-details-20261010'
backup = Path('/home/jeblast/backups/doran-dispatch-details-20261010')
incoming = Path('/home/jeblast/dispatch-details-20261010.tar.gz')
assert app.is_dir() and not (backup / 'previous-runtime').exists()
stage.mkdir(mode=0o700, exist_ok=True)
backup.mkdir(mode=0o700, exist_ok=True)
names = ['src', 'public', 'prisma', 'deployment', 'package.json', 'package-lock.json', 'next.config.js', 'next-i18next.config.js', 'tsconfig.json', 'tsconfig.server.json', '.eslintrc.json', 'ecosystem.config.js']
with tarfile.open(backup / 'source-before.tar.gz', 'w:gz') as archive:
    for name in names:
        archive.add(app / name, arcname=name)
for name in names:
    source, target = app / name, stage / name
    if source.is_dir():
        if not target.exists():
            shutil.copytree(source, target)
    else:
        shutil.copy2(source, target)
shutil.copy2(app / '.env', stage / '.env')
if not (stage / 'node_modules').exists():
    (stage / 'node_modules').symlink_to(app / 'node_modules', target_is_directory=True)
with tarfile.open(incoming, 'r:gz') as archive:
    for member in archive.getmembers():
        target = (stage / member.name).resolve()
        assert stage.resolve() in target.parents and member.isfile()
        target.parent.mkdir(parents=True, exist_ok=True)
        with archive.extractfile(member) as source, target.open('wb') as output:
            shutil.copyfileobj(source, output)
manifest = json.loads((stage / 'deployment/dispatch-details-manifest.json').read_text())
(stage / 'ui-source-manifest.json').write_text(json.dumps(manifest))
(backup / 'changed-files.json').write_text(json.dumps(list(manifest)))
env = dict(os.environ, PATH='/home/jeblast/.local/share/doran-node/node-v24.21.0-linux-x64/bin:' + os.environ['PATH'], WHATSAPP_ENABLED='false', DISPATCH_QUEUE_ENABLED='false', QUEUE_ENABLED='false', NODE_OPTIONS='--max-old-space-size=8192')
with (backup / 'build.log').open('w') as log:
    subprocess.run(['node', 'deployment/verify-dispatch-presentation.cjs'], cwd=stage, env=env, stdout=log, stderr=subprocess.STDOUT, check=True)
    subprocess.run(['npm', 'run', 'build'], cwd=stage, env=env, stdout=log, stderr=subprocess.STDOUT, check=True)
print('STAGED_PRODUCTION_BUILD_AND_DISPATCH_DETAIL_CHECKS_PASSED', flush=True)

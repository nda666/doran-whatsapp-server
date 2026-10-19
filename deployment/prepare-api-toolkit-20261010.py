from pathlib import Path
import hashlib
import json
import os
import shutil
import subprocess
import tarfile

app = Path('/home/jeblast/repos/doran-whatsapp-server')
stage = app.parent / '.doran-api-toolkit-20261010'
backup = Path('/home/jeblast/backups/doran-api-toolkit-20261010')
incoming = Path('/home/jeblast/api-toolkit-incoming-20261010')
assert app.is_dir() and not stage.exists() and not backup.exists()
changed = ['src/pages/dashboard/api-docs.tsx', 'src/components/ApiIntegrationExamples.tsx', 'src/lib/apiIntegrationSamples.ts', 'src/data/apiDocumentation.json', 'public/downloads/jeblast-api.postman_collection.json', 'public/downloads/jeblast-api.postman_environment.json', 'public/downloads/jeblast-api-curl-guide.pdf', 'deployment/verify-api-toolkit.cjs', 'deployment/verify-api-toolkit-live.cjs', 'deployment/postman-collection-schema.json']
for name in changed:
    baseline = incoming / 'baseline' / name
    if baseline.exists():
        assert (app / name).read_text() == baseline.read_text(), 'Live source differs: ' + name
    else:
        assert not (app / name).exists(), 'New file already exists: ' + name
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
for name in changed:
    (stage / name).parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(incoming / name, stage / name)
manifest = {name: hashlib.sha256((stage / name).read_bytes()).hexdigest() for name in changed}
(stage / 'ui-source-manifest.json').write_text(json.dumps(manifest))
(backup / 'changed-files.json').write_text(json.dumps(changed))
env = dict(os.environ, PATH='/home/jeblast/.local/share/doran-node/node-v24.21.0-linux-x64/bin:' + os.environ['PATH'], WHATSAPP_ENABLED='false', DISPATCH_QUEUE_ENABLED='false', QUEUE_ENABLED='false', NODE_OPTIONS='--max-old-space-size=8192')
with (backup / 'build.log').open('w') as log:
    subprocess.run(['node', 'deployment/verify-api-toolkit.cjs'], cwd=stage, env=env, stdout=log, stderr=subprocess.STDOUT, check=True)
    subprocess.run(['npm', 'run', 'build'], cwd=stage, env=env, stdout=log, stderr=subprocess.STDOUT, check=True)
assert (app / '.next/BUILD_ID').read_text() == (backup / 'build-id-before').read_text(), 'Concurrent deployment detected'
for name in changed:
    baseline = incoming / 'baseline' / name
    if baseline.exists():
        assert (app / name).read_text() == baseline.read_text(), 'Live source changed during build'
print('API_TOOLKIT_STAGING_REGRESSIONS_AND_BUILD_PASSED', flush=True)

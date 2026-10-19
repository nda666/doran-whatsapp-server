"""Deploy templates/AI with isolated Prisma generation, additive migration and rollback."""
from pathlib import Path
import fcntl
import hashlib
import json
import os
import re
import secrets
import shutil
import subprocess
import time
import urllib.request
import zipfile
from stage_cleanup import StageCleanup
from backup_retention import prune_deploy_backups

app = Path('/home/jeblast/repos/doran-whatsapp-server')
stamp = str(int(time.time()))
stage = app.parent / ('.doran-templates-ai-' + stamp)
backup = Path('/home/jeblast/backups') / ('doran-templates-ai-' + stamp)
incoming = Path('/home/jeblast/templates-ai-deploy-20261016.zip')
os.environ['PATH'] = '/home/jeblast/.local/share/doran-node/node-v24.21.0-linux-x64/bin:' + os.environ['PATH']
lock = open('/home/jeblast/.doran-templates-ai-deploy.lock', 'w')
fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
assert app.is_dir() and not stage.exists() and not backup.exists()
backup.mkdir(mode=0o700)
stage.mkdir(mode=0o700)
stage_cleanup = StageCleanup(app.parent, stage)
print('BACKUP', backup, flush=True)
build_before = (app / '.next/BUILD_ID').read_text()
env_before = (app / '.env').read_bytes()
shutil.copy2(app / '.env', backup / '.env')
os.chmod(backup / '.env', 0o600)

def digest(path): return hashlib.sha256(path.read_bytes()).hexdigest() if path.is_file() else None
def client_digest(folder):
    return {str(p.relative_to(folder)): digest(p) for p in folder.rglob('*') if p.is_file()}

client_before = client_digest(app / 'node_modules/.prisma/client')
with zipfile.ZipFile(incoming) as archive:
    manifest = json.loads(archive.read('manifest.json'))
    baseline = json.loads(archive.read('baseline.json'))
    assert set(manifest) == set(baseline)
    for name in manifest:
        assert not Path(name).is_absolute() and '..' not in Path(name).parts
        assert digest(app / name) == baseline[name], 'Live source differs from baseline: ' + name
        if (app / name).is_file():
            target = backup / 'source' / name
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(app / name, target)
    for name in ['src', 'public', 'prisma', 'deployment', 'package.json', 'package-lock.json', 'next.config.js', 'next-i18next.config.js', 'tsconfig.json', 'tsconfig.server.json', '.eslintrc.json', 'ecosystem.config.js']:
        source, target = app / name, stage / name
        if source.is_dir(): shutil.copytree(source, target)
        else: shutil.copy2(source, target)
    for name, expected in manifest.items():
        data = archive.read(name)
        assert hashlib.sha256(data).hexdigest() == expected, name
        target = stage / name
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data)

(backup / 'manifest.json').write_text(json.dumps(manifest))
(backup / 'source-before.json').write_text(json.dumps(baseline))
# Isolate the generated client and its wrapper; all other installed packages are read-only symlinks.
modules = stage / 'node_modules'
modules.mkdir()
for dependency in (app / 'node_modules').iterdir():
    if dependency.name in ['.prisma', '@prisma']: continue
    (modules / dependency.name).symlink_to(dependency, target_is_directory=dependency.is_dir())
(modules / '@prisma').mkdir()
for dependency in (app / 'node_modules/@prisma').iterdir():
    if dependency.name == 'client': shutil.copytree(dependency, modules / '@prisma/client')
    else: (modules / '@prisma' / dependency.name).symlink_to(dependency, target_is_directory=dependency.is_dir())
(modules / '.prisma').mkdir()
shutil.copytree(app / 'node_modules/.prisma/client', modules / '.prisma/client')

env_text = env_before.decode()
key_match = re.search(r'^AI_SECRET_KEY=(.*)$', env_text, re.M)
if key_match:
    key_value = key_match.group(1).strip().strip('"').strip("'")
    assert not key_value or re.fullmatch(r'[a-fA-F0-9]{64}', key_value), 'Existing AI_SECRET_KEY is invalid; no rotation performed'
else: key_value = ''
if not key_value:
    line = 'AI_SECRET_KEY=' + secrets.token_hex(32)
    env_text = re.sub(r'^AI_SECRET_KEY=.*$', line, env_text, flags=re.M) if key_match else env_text.rstrip() + '\n' + line + '\n'
(stage / '.env').write_text(env_text)
os.chmod(stage / '.env', 0o600)
env = dict(os.environ, WHATSAPP_ENABLED='false', DISPATCH_QUEUE_ENABLED='false', QUEUE_ENABLED='false', NODE_OPTIONS='--max-old-space-size=8192')

def run_logged(command, logfile, cwd=stage, command_env=env):
    with (backup / logfile).open('a') as output:
        result = subprocess.run(command, cwd=cwd, env=command_env, stdout=output, stderr=subprocess.STDOUT)
    if result.returncode:
        print((backup / logfile).read_text()[-10000:], flush=True)
        raise RuntimeError('Command failed: ' + ' '.join(command))

run_logged(['node', 'node_modules/prisma/build/index.js', 'generate'], 'build.log')
assert client_digest(app / 'node_modules/.prisma/client') == client_before, 'Isolated generate modified live client'
checks = [
    ['python3', 'deployment/verify-stage-cleanup.py'], ['python3', 'deployment/verify-backup-retention.py'],
    ['node', 'deployment/verify-templates-ai.cjs'], ['node', 'deployment/verify-auto-reply-controls.cjs'],
    ['node', 'deployment/verify-auto-reply-typing.cjs'], ['node', 'deployment/verify-auto-reply-status.cjs'],
    ['node', 'deployment/verify-auto-reply-form-reset.cjs'], ['node', 'deployment/verify-test-send-types.cjs'],
    ['node', 'deployment/verify-wa-recovery.cjs'], ['npm', 'run', 'build'],
]
for command in checks: run_logged(command, 'build.log')
assert (modules / '.prisma/client/index.d.ts').is_file()
print('ISOLATED_BUILD_TESTS_AND_CLIENT_PASSED', flush=True)
assert (app / '.next/BUILD_ID').read_text() == build_before, 'Concurrent deployment detected'
assert (app / '.env').read_bytes() == env_before, 'Concurrent environment change'
for name, expected in baseline.items(): assert digest(app / name) == expected, 'Concurrent source change: ' + name

# Full database snapshot before additive migration. Credentials stay in the child environment.
with (backup / 'database-before.sql').open('wb') as output, (backup / 'database-backup.log').open('wb') as error:
    subprocess.run(['node', 'deployment/backup-user-active-db.cjs'], cwd=stage, env=env, stdout=output, stderr=error, check=True)
os.chmod(backup / 'database-before.sql', 0o600)
assert (backup / 'database-before.sql').stat().st_size > 1000, 'Database backup unexpectedly small'
print('DATABASE_BACKUP_READY', flush=True)
run_logged(['node', 'node_modules/prisma/build/index.js', 'migrate', 'deploy'], 'migration.log')
print('ADDITIVE_MIGRATION_APPLIED', flush=True)

def ready(port):
    for _ in range(45):
        try:
            if urllib.request.urlopen(f'http://127.0.0.1:{port}/signin', timeout=3).status == 200: return True
        except Exception: pass
        time.sleep(1)
    return False

with (backup / 'staging-http.log').open('w') as output:
    probe = subprocess.Popen(['node', 'node_modules/next/dist/bin/next', 'start', '-H', '127.0.0.1', '-p', '3001'], cwd=stage, env=env, stdout=output, stderr=subprocess.STDOUT)
    try:
        assert ready(3001), 'Staging HTTP failed'
        run_logged(['node', 'deployment/verify-templates-ai-live.cjs'], 'staging-api-check.log', command_env=dict(env, TEMPLATES_AI_TEST_BASE='http://127.0.0.1:3001'))
    finally:
        probe.terminate()
        try: probe.wait(timeout=15)
        except subprocess.TimeoutExpired: probe.kill(); probe.wait()
print('AUTHENTICATED_STAGING_API_AND_ENCRYPTION_PASSED', flush=True)

def pm2(*args): return subprocess.check_output(['/usr/local/bin/pm2', *args], cwd=app)
def processes(): return {p['name']: p for p in json.loads(pm2('jlist'))}
before = processes()
unrelated = {name: p['pid'] for name, p in before.items() if name != 'doran-whatsapp'}
assert (app / '.next/BUILD_ID').read_text() == build_before
assert (app / '.env').read_bytes() == env_before
assert client_digest(app / 'node_modules/.prisma/client') == client_before
for name, expected in baseline.items(): assert digest(app / name) == expected, name
old = backup / 'runtime'; old.mkdir(mode=0o700)
moved_old, moved_new, client_moved, new_client_moved = [], [], False, False
stage_cleanup.preserve = True
pm2('stop', 'doran-whatsapp')
try:
    for name in ['.next', 'dist']:
        (app / name).rename(old / name); moved_old.append(name)
        (stage / name).rename(app / name); moved_new.append(name)
    (app / 'node_modules/.prisma/client').rename(backup / 'prisma-client'); client_moved = True
    (modules / '.prisma/client').rename(app / 'node_modules/.prisma/client'); new_client_moved = True
    for name in manifest:
        target = app / name; target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(stage / name, target)
    shutil.copy2(stage / '.env', app / '.env'); os.chmod(app / '.env', 0o600)
    pm2('startOrReload', 'ecosystem.config.js', '--only', 'doran-whatsapp', '--update-env')
    assert ready(3000), 'Production startup failed'
    after = processes()
    assert after['doran-whatsapp']['pm2_env']['status'] == 'online'
    assert after['doran-whatsapp']['pm2_env']['WHATSAPP_ENABLED'] == 'true'
    assert after['doran-whatsapp']['pm2_env']['DISPATCH_QUEUE_ENABLED'] == 'true'
    assert all(after[name]['pid'] == pid for name, pid in unrelated.items()), 'Unrelated process changed'
    for name, expected in manifest.items(): assert digest(app / name) == expected, name
    live_env = dict(os.environ, NODE_OPTIONS='--max-old-space-size=4096', TEMPLATES_AI_TEST_BASE='http://127.0.0.1:3000')
    run_logged(['node', 'deployment/verify-templates-ai-live.cjs'], 'production-api-check.log', cwd=app, command_env=live_env)
except Exception:
    pm2('stop', 'doran-whatsapp')
    for name in moved_new: (app / name).rename(stage / name)
    for name in moved_old: (old / name).rename(app / name)
    if new_client_moved: (app / 'node_modules/.prisma/client').rename(modules / '.prisma/client')
    if client_moved: (backup / 'prisma-client').rename(app / 'node_modules/.prisma/client')
    for name, expected in baseline.items():
        if expected is None:
            if (app / name).is_file(): (app / name).unlink()
        else: shutil.copy2(backup / 'source' / name, app / name)
    shutil.copy2(backup / '.env', app / '.env')
    pm2('startOrReload', 'ecosystem.config.js', '--only', 'doran-whatsapp', '--update-env')
    assert ready(3000), 'Rollback startup failed; staging retained'
    stage_cleanup.preserve = False
    print('ROLLED_BACK_RUNTIME_ADDITIVE_SCHEMA_RETAINED', backup, flush=True)
    raise
stage_cleanup.preserve = False
stage_cleanup.cleanup()
pm2('save')
success = {'active_build': (app / '.next/BUILD_ID').read_text().strip(), 'previous_build': build_before.strip(), 'migration': '20261016110000_templates_ai_plugins', 'ai_encryption_ready': True, 'unrelated_pids_preserved': unrelated}
(backup / 'SUCCESS.json').write_text(json.dumps(success, indent=2))
prune_deploy_backups(backup.parent, backup)
print('DEPLOYED_TEMPLATES_AI', json.dumps(success), flush=True)
print('BACKUP', backup, flush=True)

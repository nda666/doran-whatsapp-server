"""Isolated build, private database/env backup, additive migration and rollback of app/runtime."""
from pathlib import Path
import hashlib, json, os, shutil, subprocess, sys, time, urllib.request, zipfile

app = Path('/home/jeblast/repos/doran-whatsapp-server')
stamp = str(int(time.time()))
stage = app.parent / ('.doran-global-settings-reset-' + stamp)
backup = Path('/home/jeblast/backups') / ('doran-global-settings-reset-' + stamp)
incoming = Path('/home/jeblast/global-settings-reset-20261012.zip')
private_file = Path('/home/jeblast/global-settings-reset-private.json')
node_path = '/home/jeblast/.local/share/doran-node/node-v24.21.0-linux-x64/bin'
os.environ['PATH'] = node_path + ':' + os.environ['PATH']
def prepare():
    assert app.is_dir() and not stage.exists() and not backup.exists()
    backup.mkdir(mode=0o700); stage.mkdir(mode=0o700)
    print('BACKUP', backup, flush=True)
    build_before = (app / '.next/BUILD_ID').read_text()
    with zipfile.ZipFile(incoming) as archive:
        manifest = json.loads(archive.read('manifest.json'))
        baseline = json.loads(archive.read('baseline.json'))
        for name in manifest: assert not Path(name).is_absolute() and '..' not in Path(name).parts
        source_before = {}
        for name, expected in baseline.items():
            live = app / name
            actual = hashlib.sha256(live.read_bytes()).hexdigest() if live.exists() else None
            assert actual == expected, 'Live source differs from baseline: ' + name
            source_before[name] = actual
            if live.exists():
                target = backup / 'source' / name; target.parent.mkdir(parents=True, exist_ok=True); shutil.copy2(live, target)
        for name in ['src', 'public', 'prisma', 'deployment', 'package.json', 'package-lock.json', 'next.config.js', 'next-i18next.config.js', 'tsconfig.json', 'tsconfig.server.json', '.eslintrc.json', 'ecosystem.config.js']:
            source, target = app / name, stage / name
            if source.is_dir(): shutil.copytree(source, target)
            else: shutil.copy2(source, target)
        for name in ['.env', '.env.local', '.env.production', '.env.production.local']:
            if (app / name).is_file():
                shutil.copy2(app / name, stage / name)
                shutil.copy2(app / name, backup / name)
                os.chmod(stage / name, 0o600); os.chmod(backup / name, 0o600)
        subprocess.run(['cp', '-a', '--reflink=auto', str(app / 'node_modules'), str(stage / 'node_modules')], check=True)
        for name, digest in manifest.items():
            content = archive.read(name); assert hashlib.sha256(content).hexdigest() == digest
            target = stage / name; target.parent.mkdir(parents=True, exist_ok=True); target.write_bytes(content)
    (backup / 'manifest.json').write_text(json.dumps(manifest))
    (backup / 'source-before.json').write_text(json.dumps(source_before))
    env = dict(os.environ, WHATSAPP_ENABLED='false', DISPATCH_QUEUE_ENABLED='false', QUEUE_ENABLED='false', NODE_OPTIONS='--max-old-space-size=8192')
    # Each test executable has its own process; fixture environment variables cannot enter the production build.
    commands = [
        ['npx', '--no-install', 'prisma', 'generate'],
        ['node', 'deployment/verify-user-profile.cjs'],
        ['node', 'deployment/verify-admin-user-token.cjs'],
        ['node', 'deployment/verify-super-admin-access.cjs'],
        ['node', 'deployment/verify-global-settings-password-reset.cjs'],
        ['npm', 'run', 'build'],
    ]
    with (backup / 'build.log').open('w') as log:
        for command in commands:
            print('PREPARE', ' '.join(command), flush=True)
            result = subprocess.run(command, cwd=stage, env=env, stdout=log, stderr=subprocess.STDOUT)
            if result.returncode:
                print((backup / 'build.log').read_text()[-12000:], flush=True)
                raise RuntimeError('Isolated build/check failed')
    print('ISOLATED_BUILD_AND_TESTS_PASSED', flush=True)
    return stage, backup, build_before, source_before, manifest, env

if '--activate' in sys.argv:
    ready_path = Path(sys.argv[sys.argv.index('--activate') + 1]).resolve()
    assert ready_path.parent.parent == Path('/home/jeblast/backups') and ready_path.name == 'ready.json'
    state = json.loads(ready_path.read_text())
    stage, backup = Path(state['stage']), ready_path.parent
    assert stage.parent == app.parent and stage.name.startswith('.doran-global-settings-reset-')
    build_before, source_before, manifest = state['build_before'], state['source_before'], state['manifest']
    env = dict(os.environ, WHATSAPP_ENABLED='false', DISPATCH_QUEUE_ENABLED='false', QUEUE_ENABLED='false', NODE_OPTIONS='--max-old-space-size=8192')
else:
    stage, backup, build_before, source_before, manifest, env = prepare()
    (backup / 'ready.json').write_text(json.dumps({'stage': str(stage), 'build_before': build_before, 'source_before': source_before, 'manifest': manifest}))
    if '--prepare-only' in sys.argv:
        print('PREPARED_ONLY_NO_SECRETS_NO_PRODUCTION_CHANGES', backup / 'ready.json', flush=True)
        sys.exit(0)
os.chmod(private_file, 0o600)
private = json.loads(private_file.read_text())
# Validate the supplied Postmark token and the requested streams without sending email.
for endpoint in ['/server', '/message-streams/outbound', '/message-streams/broadcast']:
    request = urllib.request.Request('https://api.postmarkapp.com' + endpoint,
        headers={'Accept': 'application/json', 'X-Postmark-Server-Token': private['POSTMARK_SERVER_TOKEN']})
    with urllib.request.urlopen(request, timeout=20) as response:
        assert response.status == 200
        body = json.load(response)
        if '/message-streams/' in endpoint: assert body['ID'] == endpoint.rsplit('/', 1)[1]
print('POSTMARK_SERVER_AND_BOTH_STREAMS_VERIFIED_NO_EMAIL_SENT', flush=True)
# Add only feature secrets, preserving all existing production env values and encryption keys.
env_file = stage / '.env'
text = env_file.read_text()
existing_keys = {line.split('=', 1)[0].strip() for line in text.splitlines() if '=' in line}
for key in ['POSTMARK_SERVER_TOKEN', 'SETTINGS_ENCRYPTION_KEY']:
    if key not in existing_keys:
        value = private[key]; assert '\n' not in value and '\r' not in value
        text += '\n' + key + '=' + value + '\n'
env_file.write_text(text); os.chmod(env_file, 0o600)
private_file.unlink()
assert (app / '.next/BUILD_ID').read_text() == build_before, 'Concurrent deployment detected'
for name, digest in source_before.items():
    live = app / name
    assert (hashlib.sha256(live.read_bytes()).hexdigest() if live.exists() else None) == digest, 'Concurrent source change: ' + name
def pm2(*args):
    return subprocess.run(['/usr/local/bin/pm2', *args], cwd=app, check=True, stdout=subprocess.PIPE).stdout
def processes(): return {p['name']: p for p in json.loads(pm2('jlist'))}
def ready():
    for _ in range(45):
        try:
            if urllib.request.urlopen('http://127.0.0.1:3000/signin', timeout=3).status == 200: return True
        except Exception: pass
        time.sleep(1)
    return False
before = processes()
telegram_pid = before['telegram-sender']['pid']
old = backup / 'runtime'; old.mkdir(mode=0o700, exist_ok=True)
assert not any(old.iterdir()), 'Runtime backup directory must be empty before activation'
moved_old, moved_new = [], []
if not (backup / 'database.sql').exists():
    with (backup / 'database.sql').open('wb') as database_backup:
        os.chmod(backup / 'database.sql', 0o600)
        subprocess.run(['node', str(stage / 'deployment/backup-user-active-db.cjs')], cwd=stage, env=env, stdout=database_backup, check=True)
assert (backup / 'database.sql').stat().st_size > 0
subprocess.run(['node', 'deployment/check-global-settings-reset-migration.cjs'], cwd=stage, env=env, check=True)
print('DATABASE_AND_ENV_BACKUPS_READY', flush=True)
pm2('stop', 'doran-whatsapp')
try:
    subprocess.run(['npx', '--no-install', 'prisma', 'migrate', 'deploy'], cwd=stage, env=env, check=True)
    subprocess.run(['node', 'deployment/initialize-postmark-setting.cjs'], cwd=stage, env=dict(env, NODE_ENV='production'), check=True)
    for name in ['.next', 'dist', 'node_modules']:
        (app / name).rename(old / name); moved_old.append(name)
        (stage / name).rename(app / name); moved_new.append(name)
    for name in manifest:
        target = app / name; target.parent.mkdir(parents=True, exist_ok=True); shutil.copy2(stage / name, target)
    shutil.copy2(stage / '.env', app / '.env'); os.chmod(app / '.env', 0o600)
    pm2('startOrReload', 'ecosystem.config.js', '--only', 'doran-whatsapp', '--update-env')
    assert ready(), 'Startup failed'
    subprocess.run(['node', 'deployment/verify-global-settings-reset-live.cjs'], cwd=app, env=dict(os.environ, NODE_ENV='production'), check=True)
    after = processes()
    assert after['telegram-sender']['pid'] == telegram_pid
    assert after['doran-whatsapp']['pm2_env']['status'] == 'online'
    for flag in ['DISPATCH_QUEUE_ENABLED', 'WHATSAPP_ENABLED', 'QUEUE_ENABLED']:
        assert after['doran-whatsapp']['pm2_env'].get(flag) == before['doran-whatsapp']['pm2_env'].get(flag), flag
    for name, digest in manifest.items(): assert hashlib.sha256((app / name).read_bytes()).hexdigest() == digest, name
except Exception:
    pm2('stop', 'doran-whatsapp')
    for name in moved_new: (app / name).rename(stage / name)
    for name in moved_old: (old / name).rename(app / name)
    for name, digest in source_before.items():
        if digest is None:
            if (app / name).is_file(): (app / name).unlink()
        else: shutil.copy2(backup / 'source' / name, app / name)
    shutil.copy2(backup / '.env', app / '.env'); os.chmod(app / '.env', 0o600)
    pm2('startOrReload', 'ecosystem.config.js', '--only', 'doran-whatsapp', '--update-env')
    print('ROLLED_BACK_APP_RUNTIME_ADDITIVE_TABLES_RETAINED', backup, flush=True)
    raise
pm2('save')
print('DEPLOYED_GLOBAL_SETTINGS_RESET', (app / '.next/BUILD_ID').read_text().strip(), flush=True)
print('BACKUP', backup, flush=True)

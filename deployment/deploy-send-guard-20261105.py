"""Build a baseline-checked patch in isolation, then promote with runtime rollback."""
from pathlib import Path
import argparse
import fcntl
import hashlib
import json
import os
import shutil
import subprocess
import time
import zipfile

APP = Path('/home/jeblast/repos/doran-whatsapp-server')
NODE = '/home/jeblast/.local/share/doran-node/node-v24.21.0-linux-x64/bin'
os.environ['PATH'] = NODE + ':' + os.environ['PATH']

def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest() if path.is_file() else None

def source_digest(path):
    return hashlib.sha256(path.read_text().encode()).hexdigest() if path.is_file() else None

def run(command, cwd, log, env=None):
    with log.open('ab') as output:
        result = subprocess.run(command, cwd=str(cwd), env=env, stdout=output, stderr=subprocess.STDOUT, timeout=1800)
    if result.returncode:
        raise RuntimeError('Command failed: ' + command[0] + '; details in private log ' + str(log))

def prepare(archive):
    stamp = str(int(time.time()))
    stage = APP.parent / ('.doran-send-guard-' + stamp)
    backup = Path('/home/jeblast/backups') / ('doran-send-guard-' + stamp)
    stage.mkdir(mode=0o700)
    backup.mkdir(mode=0o700)
    with zipfile.ZipFile(str(archive)) as incoming:
        manifest = json.loads(incoming.read('manifest.json'))
        for name, record in manifest.items():
            assert name.startswith(('src/', 'deployment/')) and '..' not in Path(name).parts
            assert source_digest(APP / name) == record['before'], 'Production baseline changed: ' + name
            assert hashlib.sha256(incoming.read(name)).hexdigest() == record['after']
        files = ['src', 'public', 'prisma', 'deployment', 'package.json', 'package-lock.json',
                 'next.config.js', 'next-i18next.config.js', 'tsconfig.json', 'tsconfig.server.json',
                 '.eslintrc.json', 'ecosystem.config.js', '.nvmrc', '.node-version', '.npmrc']
        for name in files:
            source, target = APP / name, stage / name
            if source.is_dir():
                excludes = ['--exclude=/uploads', '--exclude=/downloads'] if name == 'public' else []
                subprocess.run(['rsync', '-a'] + excludes + [str(source) + '/', str(target) + '/'], check=True)
            elif source.is_file():
                shutil.copy2(str(source), str(target))
        for source in APP.glob('.env*'):
            if source.is_file() and source.name != '.env.example':
                shutil.copy2(str(source), str(stage / source.name))
                (stage / source.name).chmod(0o600)
        (stage / 'node_modules').symlink_to(APP / 'node_modules', target_is_directory=True)
        for name in ['webpack', 'swc']:
            source, target = APP / '.next/cache' / name, stage / '.next/cache' / name
            if source.is_dir():
                target.parent.mkdir(parents=True, exist_ok=True)
                shutil.copytree(str(source), str(target))
        originals = {}
        for name, record in manifest.items():
            originals[name] = digest(APP / name)
            if originals[name] is not None:
                target = backup / 'source' / name
                target.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(str(APP / name), str(target))
            target = stage / name
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(incoming.read(name))
    metadata = {'stage': str(stage), 'buildBefore': (APP / '.next/BUILD_ID').read_text(),
                'originals': originals, 'manifest': manifest}
    (backup / 'prepared.json').write_text(json.dumps(metadata))
    print('STAGE', stage, 'BACKUP', backup, flush=True)
    env = dict(os.environ, NODE_ENV='production', WHATSAPP_ENABLED='false', QUEUE_ENABLED='false',
               DISPATCH_QUEUE_ENABLED='false', NODE_OPTIONS='--max-old-space-size=4096')
    for command in [['npm', 'run', 'build'], ['node', 'deployment/verify-send-guard-build.cjs'],
                    ['node', 'deployment/ci-tests.cjs']]:
        print('CHECK_STARTED', ' '.join(command), flush=True)
        run(command, stage, backup / 'checks.log', env)
        print('CHECK_PASSED', ' '.join(command), flush=True)
    (backup / 'READY').write_text((stage / '.next/BUILD_ID').read_text())
    print('PATCH_READY', backup, flush=True)

def promote(backup):
    assert backup.resolve().parent == Path('/home/jeblast/backups') and backup.name.startswith('doran-send-guard-')
    metadata = json.loads((backup / 'prepared.json').read_text())
    stage = Path(metadata['stage'])
    assert stage.resolve().parent == APP.parent and stage.name.startswith('.doran-send-guard-') and not stage.is_symlink()
    assert (backup / 'READY').read_text() == (stage / '.next/BUILD_ID').read_text()
    assert (APP / '.next/BUILD_ID').read_text() == metadata['buildBefore'], 'Concurrent deployment'
    for name, before in metadata['originals'].items():
        assert digest(APP / name) == before, 'Concurrent source change: ' + name
        assert digest(stage / name) == metadata['manifest'][name]['after']
    def pm2(*args):
        return subprocess.check_output(['/usr/local/bin/pm2'] + list(args), cwd=str(APP))
    def processes():
        return {p['name']: {'pid': p['pid'], 'status': p['pm2_env']['status']} for p in json.loads(pm2('jlist'))}
    before_processes = processes()
    assert before_processes['doran-whatsapp']['status'] == 'online'
    old = backup / 'runtime'
    old.mkdir(mode=0o700)
    moved_old, moved_new = [], []
    try:
        pm2('stop', 'doran-whatsapp')
        # No schema/data edits. Save a recovery dump and verify row counts while drained.
        run(['node', 'deployment/cd-database.cjs', 'dump', str(backup / 'database.sql')], APP, backup / 'promotion.log')
        audit_before = subprocess.check_output(['node', 'deployment/cd-database.cjs', 'audit'], cwd=str(APP))
        (backup / 'database-before.json').write_bytes(audit_before)
        for name in ['.next', 'dist']:
            (APP / name).rename(old / name)
            moved_old.append(name)
            (stage / name).rename(APP / name)
            moved_new.append(name)
        for name in metadata['manifest']:
            target = APP / name
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(str(stage / name), str(target))
        audit_after = subprocess.check_output(['node', 'deployment/cd-database.cjs', 'audit'], cwd=str(APP))
        assert audit_after == audit_before, 'Database changed during runtime swap'
        run(['node', 'deployment/verify-send-guard-build.cjs'], APP, backup / 'promotion.log')
        pm2('startOrReload', 'ecosystem.config.js', '--only', 'doran-whatsapp', '--update-env')
        for attempt in range(60):
            try:
                run(['node', 'deployment/cd-database.cjs', 'health'], APP, backup / 'promotion.log')
                break
            except RuntimeError:
                if attempt == 59:
                    raise
                time.sleep(2)
        run(['curl', '--fail', '--silent', '--show-error', '--max-time', '20',
             '--output', '/dev/null', 'https://dashboard.jeblast.com/signin'], APP, backup / 'promotion.log')
        after_processes = processes()
        for name, state in before_processes.items():
            if name not in ['doran-whatsapp', 'backendsms']:
                assert after_processes.get(name) == state, 'Unrelated service changed: ' + name
        assert after_processes['doran-whatsapp']['status'] == 'online'
        for name, record in metadata['manifest'].items():
            assert digest(APP / name) == record['after']
        pm2('save')
    except BaseException:
        pm2('stop', 'doran-whatsapp')
        for name in reversed(moved_new):
            (APP / name).rename(stage / name)
        for name in reversed(moved_old):
            (old / name).rename(APP / name)
        for name, before in metadata['originals'].items():
            if before is None:
                if (APP / name).is_file():
                    (APP / name).unlink()
            else:
                shutil.copy2(str(backup / 'source' / name), str(APP / name))
        pm2('startOrReload', 'ecosystem.config.js', '--only', 'doran-whatsapp', '--update-env')
        print('PATCH_ROLLED_BACK', backup, flush=True)
        raise
    result = {'build': (APP / '.next/BUILD_ID').read_text().strip(), 'backup': str(backup)}
    (backup / 'SUCCESS.json').write_text(json.dumps(result))
    # Only delete this validated owned stage; nested node_modules symlink is not followed.
    shutil.rmtree(str(stage))
    print('SEND_GUARD_DEPLOYED', json.dumps(result), flush=True)

parser = argparse.ArgumentParser()
parser.add_argument('--prepare', type=Path)
parser.add_argument('--promote', type=Path)
args = parser.parse_args()
assert bool(args.prepare) != bool(args.promote)
with (APP.parent / '.doran-send-guard-deploy.lock').open('w') as lock:
    fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    if args.prepare:
        prepare(args.prepare)
    else:
        promote(args.promote)

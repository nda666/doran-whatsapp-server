"""Deploy a CI-checked archive to the existing VPS; keep private data in place."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import tarfile
import time
import urllib.request

from stage_cleanup import StageCleanup

APP = Path('/home/jeblast/repos/doran-whatsapp-server')
NODE_BIN = Path('/home/jeblast/.local/share/doran-node/node-v24.21.0-linux-x64/bin')
PM2 = '/usr/local/bin/pm2'
# Reviewed metadata reconciliation: preserve legacy inbox fields; MySQL NO ACTION
# keeps the same restriction as RESTRICT. No row data is updated or deleted.
REVIEWED_MIGRATIONS = {
    '20261019100000_align_legacy_inbox_and_phone_constraint':
        '3695f8228022afc3569e7a597fd10d4d9bd3771d9c33e97964f78d7c6516565d',
}
PARTS = ['.next', 'dist', 'node_modules', 'src', 'public', 'prisma', 'deployment',
         'package.json', 'package-lock.json', 'next.config.js', 'next-i18next.config.js',
         'tsconfig.json', 'tsconfig.server.json', 'ecosystem.config.js', '.eslintrc.json']
PUBLIC_DATA = ['uploads', 'downloads']


def validate_archive(archive, stage):
    """Reject links/traversal/private runtime data before extracting anything."""
    for item in archive.getmembers():
        name = Path(item.name)
        if name.is_absolute() or '..' in name.parts or not name.parts:
            raise ValueError('Unsafe archive path')
        if item.issym() or item.islnk() or not (item.isfile() or item.isdir()):
            raise ValueError('Archive links/special files are forbidden')
        if name.parts[0] in {'.git', 'storage', 'node_modules', '.next', 'dist', 'tmp', 'output'}:
            raise ValueError('Runtime/private files in source archive')
        if name.parts[0] == 'public' and len(name.parts) > 1 and name.parts[1] in PUBLIC_DATA:
            raise ValueError('User uploads/downloads in source archive')
        if any(part.startswith('.env') and part != '.env.example' for part in name.parts):
            raise ValueError('Secret environment file in source archive')
        if not (stage / name).resolve().is_relative_to(stage.resolve()):
            raise ValueError('Archive escapes stage')


def check_migrations(before, stage):
    migrations = {p.parent.name: p for p in (stage / 'prisma/migrations').glob('*/migration.sql')}
    applied = set()
    for row in before['migrations']:
        if row['rolled_back_at']:
            continue
        if not row['finished_at']:
            raise RuntimeError('Unfinished production migration; manual repair required')
        path = migrations.get(row['migration_name'])
        content = path.read_bytes().replace(b'\r\n', b'\n') if path else b''
        checksums = {hashlib.sha256(content).hexdigest(), hashlib.sha256(content.replace(b'\n', b'\r\n')).hexdigest()}
        if not path or row['checksum'] not in checksums:
            raise RuntimeError('Applied migration missing or checksum differs: ' + row['migration_name'])
        applied.add(row['migration_name'])
    pending = sorted(set(migrations) - applied)
    # Conservative gate: automatically run additive DDL only. Review other SQL separately.
    for name in pending:
        if name in REVIEWED_MIGRATIONS:
            if hashlib.sha256(migrations[name].read_bytes().replace(b'\r\n', b'\n')).hexdigest() != REVIEWED_MIGRATIONS[name]:
                raise RuntimeError('Reviewed migration checksum differs: ' + name)
            continue
        sql = migrations[name].read_text()
        sql = re.sub(r'/\*.*?\*/|--[^\n]*', '', sql, flags=re.S)
        for statement in sql.split(';'):
            statement = statement.strip()
            if not statement:
                continue
            if not re.match(r'^(CREATE\s+(TABLE|UNIQUE\s+INDEX|INDEX)\b|ALTER\s+TABLE\s+`?\w+`?\s+ADD\b)', statement, re.I):
                raise RuntimeError('Non-additive migration requires manual review: ' + name)
            if re.search(r'\b(DROP|TRUNCATE|DELETE|UPDATE|REPLACE|MODIFY|CHANGE|RENAME)\b', statement, re.I):
                raise RuntimeError('Potentially destructive migration blocked: ' + name)
    return pending


def compare_counts(before, after):
    for table, count in before['counts'].items():
        if table != '_prisma_migrations' and after['counts'].get(table) != count:
            raise RuntimeError('Database row count changed while stopped: ' + table)


def private_hashes(app):
    # Env + WhatsApp credentials must remain byte-identical until restart.
    files = [p for p in app.glob('.env*') if p.is_file()]
    auth = app / 'storage/whatsapp-auth'
    if auth.exists():
        files += [p for p in auth.rglob('*') if p.is_file()]
    return {str(p.relative_to(app)): hashlib.sha256(p.read_bytes()).hexdigest() for p in files}


def main():
    import fcntl  # Linux only; pure validation helpers are tested on Windows too.
    parser = argparse.ArgumentParser()
    parser.add_argument('--archive', type=Path, required=True)
    parser.add_argument('--sha', required=True)
    args = parser.parse_args()
    if not re.fullmatch(r'[0-9a-f]{40}', args.sha):
        raise ValueError('Full commit SHA required')
    if APP.is_symlink() or not APP.is_dir() or not (APP / '.env').is_file():
        raise RuntimeError('Existing production checkout and .env required')
    os.umask(0o077)
    os.environ['PATH'] = str(NODE_BIN) + ':' + os.environ['PATH']
    if subprocess.check_output(['node', '--version'], text=True).strip() != 'v24.21.0':
        raise RuntimeError('Expected production Node v24.21.0')
    lock = open(APP.parent / '.doran-cd.lock', 'w')
    fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    active_build = (APP / '.next/BUILD_ID').read_bytes()
    stamp = str(time.time_ns())
    stage = APP.parent / ('.doran-cd-' + stamp)
    backup = Path('/home/jeblast/backups') / ('doran-cd-' + stamp)
    stage.mkdir(mode=0o700)
    guard = StageCleanup(APP.parent, stage)
    backup.mkdir(mode=0o700)
    (backup / 'commit.txt').write_text(args.sha + '\n')
    archive_digest = hashlib.sha256(args.archive.read_bytes()).hexdigest()
    (backup / 'archive.sha256').write_text(archive_digest + '\n')
    with tarfile.open(args.archive) as archive:
        validate_archive(archive, stage)
        archive.extractall(stage)
    # Copy every private env variant: Next loads .env.production before .env.
    for path in APP.glob('.env*'):
        if path.is_file() and path.name != '.env.example':
            shutil.copy2(path, stage / path.name)
            (stage / path.name).chmod(0o600)
    env = dict(os.environ, NODE_ENV='production', WHATSAPP_ENABLED='false',
               QUEUE_ENABLED='false', DISPATCH_QUEUE_ENABLED='false',
               SSL_CERTBOT_ENABLED='false', NODE_OPTIONS='--max-old-space-size=4096')
    # npm ci must include build tools even under NODE_ENV=production.
    def run(command, cwd=stage, capture=False):
        result = subprocess.run(command, cwd=cwd, env=env, stdout=subprocess.PIPE,
                                stderr=subprocess.PIPE, timeout=1800)
        if result.returncode:
            # Build/database errors may include environment values; keep full output server-side.
            with (backup / 'commands.log').open('ab') as log:
                log.write(('FAILED: ' + command[0] + '\n').encode() + result.stdout + result.stderr)
            raise RuntimeError('Deployment command failed; inspect private server commands.log')
        return result.stdout if capture else None

    run(['npm', 'ci', '--include=dev'])
    run(['npx', '--no-install', 'prisma', 'generate'])
    run(['npx', '--no-install', 'prisma', 'validate'])
    run(['npm', 'run', 'build'])
    run(['node', 'deployment/ci-tests.cjs'])
    before = json.loads(run(['node', 'deployment/cd-database.cjs', 'audit'], capture=True))
    pending = check_migrations(before, stage)
    (backup / 'pending-migrations.json').write_text(json.dumps(pending))
    print('BUILD_TESTS_MIGRATION_PREFLIGHT_OK', flush=True)
    if (APP / '.next/BUILD_ID').read_bytes() != active_build:
        raise RuntimeError('Another deployment changed the active build')

    def pm2(*arguments):
        return subprocess.check_output([PM2, *arguments], cwd=APP, env=env)

    processes = json.loads(pm2('jlist'))
    target = next((p for p in processes if p['name'] == 'doran-whatsapp'), None)
    if not target or target['pm2_env']['status'] != 'online':
        raise RuntimeError('Expected existing online doran-whatsapp process')
    others = {p['name']: p['pid'] for p in processes if p['name'] != 'doran-whatsapp'}
    old = backup / 'runtime'
    old.mkdir()
    moved_old, moved_new = [], []
    detached_public, restored_public = [], []
    shared_public = backup / 'shared-public'
    shared_public.mkdir()
    guard.preserve = True
    stopped = False
    try:
        # Stop only this application to obtain stable counts and WhatsApp credentials.
        pm2('stop', 'doran-whatsapp')
        stopped = True
        frozen = private_hashes(APP)
        before = json.loads(run(['node', 'deployment/cd-database.cjs', 'audit'], capture=True))
        check_migrations(before, stage)
        (backup / 'database-before.json').write_text(json.dumps(before))
        run(['node', 'deployment/cd-database.cjs', 'dump', str(backup / 'database.sql')])
        with tarfile.open(backup / 'storage-and-env.tar', 'w') as archive:
            for path in APP.glob('.env*'):
                if path.is_file():
                    archive.add(path, arcname=path.name)
            if (APP / 'storage').exists():
                archive.add(APP / 'storage', arcname='storage')
            for name in PUBLIC_DATA:
                path = APP / 'public' / name
                if path.exists() or path.is_symlink():
                    archive.add(path, arcname='public/' + name)
        # No reset/db push/seed, and no automatic database restore.
        run(['npx', '--no-install', 'prisma', 'migrate', 'deploy'])
        run(['npx', '--no-install', 'prisma', 'migrate', 'status'])
        run(['npx', '--no-install', 'prisma', 'migrate', 'diff', '--from-schema-datasource',
             'prisma/schema.prisma', '--to-schema-datamodel', 'prisma/schema.prisma', '--exit-code'])
        after = json.loads(run(['node', 'deployment/cd-database.cjs', 'audit'], capture=True))
        compare_counts(before, after)
        if private_hashes(APP) != frozen:
            raise RuntimeError('Environment or WhatsApp session changed during deployment')
        (backup / 'database-after.json').write_text(json.dumps(after))
        # Detach persistent public files before swapping the static asset directory.
        # Move on the same filesystem: files remain intact and are never overwritten.
        for name in PUBLIC_DATA:
            path = APP / 'public' / name
            if path.exists() or path.is_symlink():
                path.rename(shared_public / name)
                detached_public.append(name)
        for name in PARTS:
            if (APP / name).exists():
                (APP / name).rename(old / name)
                moved_old.append(name)
            if (stage / name).exists():
                (stage / name).rename(APP / name)
                moved_new.append(name)
        for name in detached_public:
            (shared_public / name).rename(APP / 'public' / name)
            restored_public.append(name)
        pm2('startOrReload', 'ecosystem.config.js', '--only', 'doran-whatsapp', '--update-env')
        for attempt in range(30):
            try:
                run(['node', 'deployment/cd-database.cjs', 'health'], cwd=APP)
                break
            except RuntimeError:
                if attempt == 29:
                    raise
                time.sleep(2)
        # Public proxy must also point to a healthy application before success.
        if urllib.request.urlopen('https://dashboard.jeblast.com/signin', timeout=20).status != 200:
            raise RuntimeError('Public HTTPS health failed')
        current = json.loads(pm2('jlist'))
        if any(next((p['pid'] for p in current if p['name'] == name), None) != pid for name, pid in others.items()):
            raise RuntimeError('Unrelated PM2 process changed')
        pm2('save')
    except BaseException:
        if stopped:
            try:
                pm2('stop', 'doran-whatsapp')
                for name in restored_public:
                    (APP / 'public' / name).rename(shared_public / name)
                for name in reversed(moved_new):
                    (APP / name).rename(stage / name)
                for name in reversed(moved_old):
                    (old / name).rename(APP / name)
                for name in detached_public:
                    (shared_public / name).rename(APP / 'public' / name)
                pm2('startOrReload', 'ecosystem.config.js', '--only', 'doran-whatsapp', '--update-env')
                for attempt in range(30):
                    try:
                        if urllib.request.urlopen('http://127.0.0.1:3000/signin', timeout=5).status == 200:
                            break
                    except Exception:
                        pass
                    time.sleep(2)
                else:
                    raise RuntimeError('Rollback health failed')
                guard.preserve = False
                print('PREVIOUS_RUNTIME_RESTORED; database backup retained for manual recovery', flush=True)
            except BaseException:
                print('ROLLBACK_FAILED; preserve stage and backup for operator recovery', flush=True)
                raise
        else:
            guard.preserve = False
        raise
    guard.preserve = False
    guard.cleanup()
    (backup / 'SUCCESS.json').write_text(json.dumps({'commit': args.sha, 'archive_sha256': archive_digest}))
    # Preserve CI/CD backups until an explicit retention policy is configured.
    print('DEPLOYED', args.sha, 'BACKUP', backup, flush=True)


if __name__ == '__main__':
    main()

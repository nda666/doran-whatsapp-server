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
PARTS = ['.next', 'dist', 'node_modules', 'src', 'public', 'prisma', 'deployment',
         'package.json', 'package-lock.json', 'next.config.js', 'next-i18next.config.js',
         'tsconfig.json', 'tsconfig.server.json', 'ecosystem.config.js', '.eslintrc.json',
         '.nvmrc', '.node-version', '.npmrc']
PUBLIC_DATA = ['uploads', 'downloads']


def unrelated_processes(processes):
    """Keep only non-secret identity/configuration fields for deployment audits."""
    fields = ['status', 'restart_time', 'pm_id', 'created_at', 'pm_exec_path',
              'pm_cwd', 'exec_interpreter', 'exec_mode', 'args', 'node_args']
    return {p['name']: dict({'pid': p['pid']}, **{
        key: p['pm2_env'].get(key) for key in fields
    }) for p in processes if p['name'] != 'doran-whatsapp'}


def check_unrelated_processes(before, after):
    if set(before) != set(after):
        raise RuntimeError('Unrelated PM2 process inventory changed')
    restarted = []
    for name, previous in before.items():
        current = after[name]
        if current == previous:
            continue
        # backendsms independently restarts every ~30 minutes on this host.
        # Accept only an observed restart with unchanged identity/configuration
        # and recovered health; all other process changes still block promotion.
        stable = set(previous) - {'pid', 'restart_time'}
        if (name == 'backendsms' and previous['status'] == current['status'] == 'online'
                and previous['pid'] > 0 and current['pid'] > 0
                and previous['pid'] != current['pid']
                and isinstance(previous['restart_time'], int)
                and isinstance(current['restart_time'], int)
                and current['restart_time'] > previous['restart_time']
                and all(previous[key] == current[key] for key in stable)):
            restarted.append(name)
            continue
        raise RuntimeError('Unrelated PM2 process changed: ' + name)
    return restarted


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
        if stage.resolve() not in (stage / name).resolve().parents:
            raise ValueError('Archive escapes stage')


def migration_inventory(before, stage):
    """Record history differences without changing _prisma_migrations or schema."""
    migrations = {p.parent.name: p for p in (stage / 'prisma/migrations').glob('*/migration.sql')}
    applied = set()
    differences, unfinished = [], []
    for row in before['migrations']:
        if row['rolled_back_at']:
            continue
        if not row['finished_at']:
            unfinished.append(row['migration_name'])
            continue
        path = migrations.get(row['migration_name'])
        content = path.read_bytes().replace(b'\r\n', b'\n') if path else b''
        checksums = {hashlib.sha256(content).hexdigest(), hashlib.sha256(content.replace(b'\n', b'\r\n')).hexdigest()}
        if not path or row['checksum'] not in checksums:
            differences.append({'migration': row['migration_name'], 'database_checksum': row['checksum'],
                                'source_checksum': hashlib.sha256(content).hexdigest() if path else None})
        applied.add(row['migration_name'])
    return {'policy': 'production-read-only', 'applied': sorted(applied),
            'not_recorded_as_applied': sorted(set(migrations) - applied),
            'checksum_differences': differences, 'unfinished_migrations': unfinished,
            'history_updated': False, 'migrations_executed': False}


def enforce_read_only_prisma(command):
    if 'prisma' not in command:
        return
    operation = command[command.index('prisma') + 1:]
    if operation[:1] not in [['generate'], ['validate']] and operation[:2] != ['migrate', 'diff']:
        raise RuntimeError('Production database is read-only: Prisma command blocked')


def compare_counts(before, after, added_tables=()):
    # Only explicitly approved, newly created empty feature tables may be added.
    expected = dict(before['counts'])
    for table in added_tables:
        if table not in {'sender_groups', 'wa_dispatch_attempts'} or table in expected:
            raise RuntimeError('Unexpected schema table addition')
        expected[table] = '0'
    if expected != after['counts']:
        raise RuntimeError('Database tables or row counts changed while stopped')
    if before['migrations'] != after['migrations']:
        raise RuntimeError('Production migration history changed while stopped')


def file_digest(path):
    digest = hashlib.sha256()
    with path.open('rb') as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b''):
            digest.update(chunk)
    return digest.hexdigest()


def private_hashes(app):
    # Env + WhatsApp credentials must remain byte-identical until restart.
    result = {p.name: file_digest(p) for p in app.glob('.env*') if p.is_file()}
    auth = app / 'storage/whatsapp-auth'
    if auth.exists():
        # scandir-based walk avoids building hundreds of thousands of Path objects
        # and repeated stats before the first file is hashed.
        for folder, _directories, files in os.walk(str(auth)):
            for name in files:
                path = Path(folder) / name
                if path.is_file():
                    result[str(path.relative_to(app))] = file_digest(path)
    return result


def backup_private_files(app, destination):
    entries = [p.name for p in app.glob('.env*') if p.is_file()]
    if (app / 'storage').exists():
        entries.append('storage')
    for name in PUBLIC_DATA:
        path = app / 'public' / name
        if path.exists() or path.is_symlink():
            entries.append('public/' + name)
    # Native tar streams large storage trees; no Python member list is retained.
    subprocess.run(['tar', '-cf', str(destination), '-C', str(app), '--'] + entries,
                   check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)


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
    if subprocess.check_output(['node', '--version'], universal_newlines=True).strip() != 'v24.21.0':
        raise RuntimeError('Expected production Node v24.21.0')
    lock = open(APP.parent / '.doran-cd.lock', 'w')
    fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    active_build = (APP / '.next/BUILD_ID').read_bytes()
    stamp = str(int(time.time() * 1000000))
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
        enforce_read_only_prisma(command)
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
    (backup / 'migration-inventory.json').write_text(json.dumps(migration_inventory(before, stage)))
    # Default remains read-only. The user approved only the two additive feature
    # upgrades; validate the entire diff before stopping or touching production.
    schema_command = ['npx', '--no-install', 'prisma', 'migrate', 'diff',
                      '--from-schema-datasource', 'prisma/schema.prisma',
                      '--to-schema-datamodel', 'prisma/schema.prisma', '--exit-code']
    plan_path = backup / 'schema-feature-plan.sql'
    diff_script = schema_command[:-1] + ['--script']
    plan_path.write_bytes(run(diff_script, capture=True))
    upgrade_plan = json.loads(run(['node', 'deployment/cd-feature-schema.cjs', 'plan', str(plan_path)], capture=True))
    (backup / 'feature-schema-plan.json').write_text(json.dumps(upgrade_plan))
    print('BUILD_TESTS_APPROVED_SCHEMA_PREFLIGHT_OK', len(upgrade_plan['pending']), flush=True)
    if (APP / '.next/BUILD_ID').read_bytes() != active_build:
        raise RuntimeError('Another deployment changed the active build')

    def pm2(*arguments):
        return subprocess.check_output([PM2, *arguments], cwd=APP, env=env)

    processes = json.loads(pm2('jlist'))
    target = next((p for p in processes if p['name'] == 'doran-whatsapp'), None)
    if not target or target['pm2_env']['status'] != 'online':
        raise RuntimeError('Expected existing online doran-whatsapp process')
    others = unrelated_processes(processes)
    (backup / 'pm2-unrelated-before.json').write_text(json.dumps(others))
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
        print('AUTH_ENV_INTEGRITY_SNAPSHOT_STARTED', flush=True)
        frozen = private_hashes(APP)
        print('AUTH_ENV_INTEGRITY_SNAPSHOT_DONE', len(frozen), flush=True)
        before = json.loads(run(['node', 'deployment/cd-database.cjs', 'audit'], capture=True))
        (backup / 'database-before.json').write_text(json.dumps(before))
        run(['node', 'deployment/cd-database.cjs', 'dump', str(backup / 'database.sql')])
        print('DATABASE_BACKUP_DONE_STORAGE_BACKUP_STARTED', flush=True)
        backup_private_files(APP, backup / 'storage-and-env.tar')
        print('STORAGE_BACKUP_DONE', flush=True)
        # Never replay/resolve historical migrations or mutate existing records.
        # Only hash-pinned nullable/defaulted additions run after both backups.
        run(['node', 'deployment/cd-feature-schema.cjs', 'apply', str(plan_path), str(backup)])
        upgrade_result = json.loads((backup / 'feature-schema-result.json').read_text())
        run(schema_command)
        after = json.loads(run(['node', 'deployment/cd-database.cjs', 'audit'], capture=True))
        compare_counts(before, after, upgrade_result['created_tables'])
        print('DATABASE_AUDIT_UNCHANGED_AUTH_ENV_RECHECK_STARTED', flush=True)
        if private_hashes(APP) != frozen:
            raise RuntimeError('Environment or WhatsApp session changed during deployment')
        (backup / 'database-after.json').write_text(json.dumps(after))
        print('DATA_INTEGRITY_CHECKS_PASSED_PROMOTING_RUNTIME', flush=True)
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
        # The public proxy rejects Python's default user-agent; use the same
        # curl probe as GitHub rather than treating a WAF response as app failure.
        run(['curl', '--fail', '--silent', '--show-error', '--max-time', '20',
             'https://dashboard.jeblast.com/signin'], cwd=APP)
        current = json.loads(pm2('jlist'))
        observed = unrelated_processes(current)
        (backup / 'pm2-unrelated-after.json').write_text(json.dumps(observed))
        for name in check_unrelated_processes(others, observed):
            print('UNRELATED_SERVICE_RECOVERED_AFTER_RESTART', name, flush=True)
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

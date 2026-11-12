"""Bounded WA deployment artifact cleanup; no database or runtime changes."""
import argparse
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import time

HOME = Path('/home/jeblast')
INCOMING = re.compile(r'\.doran-incoming-([0-9a-f]{40})$')
WORK = re.compile(r'\.doran-work-[a-zA-Z0-9_-]+$')
UPLOAD_FILES = {'source.tar.gz', 'source.tar.gz.sha256', 'deployment/cd-deploy.py',
                'deployment/cd-database.cjs', 'deployment/stage_cleanup.py',
                'deployment/private_snapshot.py'}


def safe(path):
    path = Path(path).absolute()
    return all(not p.is_symlink() for p in [path] + list(path.parents))


def digest(path):
    result = hashlib.sha256()
    with Path(path).open('rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            result.update(chunk)
    return result.hexdigest()


def upload_inventory(folder):
    if not safe(folder) or not folder.is_dir():
        return None
    result = {}
    for current, dirs, files in os.walk(str(folder), followlinks=False):
        for name in dirs:
            p = Path(current) / name
            if not safe(p) or p.relative_to(folder).as_posix() != 'deployment':
                return None
        for name in files:
            p = Path(current) / name
            if not safe(p) or not p.is_file() or p.relative_to(folder).as_posix() not in UPLOAD_FILES:
                return None
            s = p.stat()
            result[p.relative_to(folder).as_posix()] = (s.st_ino, s.st_size, s.st_mtime_ns)
    return result if {'source.tar.gz', 'source.tar.gz.sha256'} <= set(result) else None


def completed_upload(folder, backups):
    match = INCOMING.fullmatch(folder.name)
    if not match or upload_inventory(folder) is None:
        return False
    archive = folder / 'source.tar.gz'
    parts = (folder / 'source.tar.gz.sha256').read_text().split()
    checksum = digest(archive)
    if len(parts) != 2 or parts[0] != checksum or parts[1] not in {'source.tar.gz', '*source.tar.gz'}:
        return False
    for backup in backups.glob('doran-cd-*'):
        success = backup / 'SUCCESS.json'
        try:
            if not safe(backup) or not safe(success) or not success.is_file():
                continue
            data = json.loads(success.read_text())
            if (data.get('commit') == match[1] and data.get('archive_sha256') == checksum
                    and success.stat().st_mtime_ns >= archive.stat().st_mtime_ns
                    and (backup / 'runtime').is_dir() and (backup / 'database.sql').is_file()):
                return True
        except (OSError, ValueError):
            continue
    return False


def process_paths():
    """Refuse unknown inaccessible processes; known session/web daemons are exempt."""
    paths = set()
    for proc in Path('/proc').iterdir():
        if not proc.name.isdigit() or int(proc.name) == os.getpid():
            continue
        try:
            if proc.stat().st_uid != os.getuid():
                continue
            args = (proc / 'cmdline').read_bytes().split(b'\0')
            for arg in args:
                value = os.fsdecode(arg)
                if value.startswith('/'):
                    paths.add(Path(value))
            try:
                paths.add(Path(os.readlink(str(proc / 'cwd'))))
                for fd in (proc / 'fd').iterdir():
                    try:
                        value = os.readlink(str(fd))
                        if value.startswith('/'):
                            paths.add(Path(value))
                    except FileNotFoundError:
                        pass
            except PermissionError:
                command = (proc / 'comm').read_text().strip()
                if command not in {'(sd-pam)', 'sshd', 'sshd-session', 'cpaneld - servi', 'php-fpm'}:
                    raise RuntimeError('Protected process prevents safe cleanup')
        except (FileNotFoundError, ProcessLookupError):
            continue
    return paths


def in_use(folder, paths):
    return any(p == folder or folder in p.parents for p in paths)


def references(home, names):
    app = home / 'repos/doran-whatsapp-server'
    sources = [app / 'ecosystem.config.js', app / 'package.json', home / '.pm2/dump.pm2']
    for root in [app / 'src', app / 'dist', app / 'deployment', app / '.github', home / '.local/bin']:
        for current, dirs, files in os.walk(str(root), followlinks=False):
            dirs[:] = [d for d in dirs if d not in {'node_modules', '.git', '__pycache__'}]
            sources.extend(Path(current) / name for name in files)
    result = set()
    for source in sources:
        if source.suffix not in {'.js', '.cjs', '.py', '.ts', '.tsx', '.sh', '.json', '.yml', '.pm2'}:
            continue
        if not safe(source) or not source.is_file() or source.stat().st_size > 3000000:
            continue
        content = source.read_text(errors='replace')
        result.update(n for n in names if n in content)
    cron = subprocess.run(['crontab', '-l'], stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                          universal_newlines=True)
    if cron.returncode not in {0, 1}:
        raise RuntimeError('Cannot inspect cron')
    result.update(n for n in names if n in cron.stdout)
    return result


def work_candidates(folder):
    manifest = folder / 'artifact-manifest.json'
    if not safe(folder) or not safe(manifest) or not manifest.is_file():
        return []
    data = json.loads(manifest.read_text())
    if data.get('version') != 1 or data.get('state') != 'completed':
        return []
    result = []
    for row in data.get('files', []):
        name = row.get('name', '')
        if (not isinstance(name, str) or Path(name).name != name or name in {'.', '..', 'artifact-manifest.json'}
                or not name.endswith(('.zip', '.tar.gz', '.log', '.py', '.cjs', '.tsx', '.json'))):
            raise ValueError('Unsafe artifact manifest entry')
        p = folder / name
        if not p.exists():
            continue
        if not safe(p) or not p.is_file() or digest(p) != row.get('sha256'):
            raise ValueError('Artifact changed or unsafe')
        result.append((p, row['sha256']))
    return result


def maintain(home, dry=False, incoming_commit=None):
    if incoming_commit is not None and not re.fullmatch(r'[0-9a-f]{40}', incoming_commit):
        raise ValueError('Full incoming commit required')
    repos = home / 'repos'
    paths = process_paths()
    report = {'at': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
              'dry_run': dry, 'actions': [], 'preserved': [], 'loose_files': []}
    for root in ([repos] if incoming_commit else [home, repos]):
        for folder in sorted(root.glob('.doran-incoming-*')):
            if incoming_commit and folder.name != '.doran-incoming-' + incoming_commit:
                continue
            inventory = upload_inventory(folder)
            if inventory is None or in_use(folder, paths):
                report['preserved'].append({'path': str(folder), 'reason': 'unknown contents or active'})
                continue
            newest = max([folder.stat().st_mtime] + [(folder / n).stat().st_mtime for n in inventory])
            if newest > time.time() - 300:
                report['preserved'].append({'path': str(folder), 'reason': 'recent upload'})
                continue
            if any(completed_upload(folder, backups) for backups in
                   [repos / 'doran-backups', home / 'backups']):
                # Recheck all paths, metadata and active users immediately before removal.
                if upload_inventory(folder) != inventory or in_use(folder, process_paths()):
                    raise RuntimeError('Upload changed during verification')
                if not dry:
                    shutil.rmtree(str(folder))
                report['actions'].append({'action': 'remove_completed_incoming', 'path': str(folder)})
            elif root == home and INCOMING.fullmatch(folder.name):
                target = repos / folder.name
                if not target.exists() and not target.is_symlink():
                    if not dry:
                        folder.rename(target)
                    report['actions'].append({'action': 'relocate_preserved_incoming', 'path': str(folder), 'target': str(target)})
                else:
                    report['preserved'].append({'path': str(folder), 'reason': 'destination exists'})
            else:
                report['preserved'].append({'path': str(folder), 'reason': 'no matching successful deployment'})
    for folder in ([] if incoming_commit else sorted(repos.glob('.doran-work-*'))):
        if not WORK.fullmatch(folder.name) or not safe(folder) or not folder.is_dir() or in_use(folder, paths):
            continue
        try:
            candidates = work_candidates(folder)
            blocked = references(home, [p.name for p, _ in candidates]) if candidates else set()
            for p, expected in candidates:
                if p.name in blocked or in_use(p, paths):
                    report['preserved'].append({'path': str(p), 'reason': 'referenced or active'})
                    continue
                if not safe(p) or digest(p) != expected or in_use(p, process_paths()):
                    raise RuntimeError('Artifact changed during verification')
                if not dry:
                    p.unlink()
                report['actions'].append({'action': 'remove_completed_work_file', 'path': str(p)})
        except (ValueError, OSError) as error:
            report['preserved'].append({'path': str(folder), 'reason': str(error)})
    report['loose_files'] = [] if incoming_commit else [str(p) for p in sorted(home.iterdir()) if p.is_file()
                             and p.suffix in {'.zip', '.log', '.py', '.tsx', '.cjs'}]
    return report


def main():
    os.umask(0o077)
    parser = argparse.ArgumentParser()
    parser.add_argument('--dry-run', action='store_true')
    parser.add_argument('--incoming-commit')
    args = parser.parse_args()
    ops = HOME / 'repos/doran-ops'
    assert safe(ops) and ops.is_dir()
    assert safe(HOME / 'repos/.doran-cd.lock')
    with (HOME / 'repos/.doran-cd.lock').open('a') as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            print(json.dumps({'skipped': 'deployment/maintenance lock busy'}))
            return
        health = subprocess.run(['curl', '--fail', '--silent', '--show-error', '--max-time', '20',
                                 '-o', '/dev/null', 'https://dashboard.jeblast.com/signin'],
                                stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        if health.returncode:
            raise RuntimeError('Dashboard health failed; cleanup stopped')
        report = maintain(HOME, args.dry_run, args.incoming_commit)
        health = subprocess.run(['curl', '--fail', '--silent', '--show-error', '--max-time', '20',
                                 '-o', '/dev/null', 'https://dashboard.jeblast.com/signin'],
                                stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        report['dashboard_healthy'] = health.returncode == 0
        if health.returncode:
            raise RuntimeError('Dashboard health failed after cleanup')
        if not args.dry_run:
            target = ops / 'latest.json'
            assert safe(target)
            target.write_text(json.dumps(report, indent=2))
        print(json.dumps(report, indent=2))


if __name__ == '__main__':
    main()

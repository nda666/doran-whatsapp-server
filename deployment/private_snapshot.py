"""Independent, incremental private-data snapshots (never hardlink live data).

Each snapshot can be restored on its own. Only unchanged *backup* files are
hardlinked with rsync --link-dest. Destinations must be new/empty, so metadata
updates can never modify an older snapshot through an existing hardlink.
"""
import json
import os
import re
import shutil
from pathlib import Path
import subprocess
import time


def reject_symlink_parents(path):
    path = Path(path).absolute()
    if any(p.is_symlink() for p in [path] + list(path.parents)):
        raise ValueError('Symlink in private snapshot path')


def private_entries(app):
    entries = sorted(p.name for p in app.glob('.env*') if p.is_file())
    for name in ('storage', 'public/uploads', 'public/downloads'):
        target = app / name
        if target.exists() or target.is_symlink():
            entries.append(name + ('/' if target.is_dir() and not target.is_symlink() else ''))
    return entries


def previous_snapshot(root):
    reject_symlink_parents(root)
    marker = root / 'latest.json'
    if marker.is_symlink():
        raise ValueError('Symlink snapshot pointer')
    if not marker.exists():
        return None
    record = json.loads(marker.read_text())
    name = record['snapshot']
    if not isinstance(name, str) or not name.startswith('snapshot-') or Path(name).name != name:
        raise ValueError('Invalid private snapshot pointer')
    snapshot = root / name
    if snapshot.is_symlink() or not snapshot.is_dir() or (snapshot / 'files').is_symlink():
        raise ValueError('Invalid private snapshot directory')
    if not (snapshot / 'COMPLETE.json').is_file() or not (snapshot / 'files').is_dir():
        raise ValueError('Incomplete previous private snapshot')
    return snapshot


def seed_from_archive(archive, root):
    """Import an existing stopped-app backup without reading live session files."""
    root = Path(root)
    reject_symlink_parents(root)
    if root.is_symlink():
        raise ValueError('Unsafe snapshot root')
    root.mkdir(mode=0o700, parents=True, exist_ok=True)
    root.chmod(0o700)
    if previous_snapshot(root):
        raise RuntimeError('A snapshot baseline already exists')
    snapshot = root / ('snapshot-seed-' + str(int(time.time() * 1000000)))
    snapshot.mkdir(mode=0o700)
    files = snapshot / 'files'
    files.mkdir(mode=0o700)
    subprocess.run(['tar', '--extract', '--file', str(archive), '--directory', str(files),
                    '--no-same-owner'], check=True, stdout=subprocess.PIPE,
                   stderr=subprocess.PIPE, timeout=1800)
    if not (files / '.env').is_file() or not (files / 'storage/whatsapp-auth').is_dir():
        raise RuntimeError('Archive lacks required private data')
    (snapshot / 'COMPLETE.json').write_text(json.dumps({
        'label': 'imported-existing-stopped-app-backup', 'archive': str(archive),
        'snapshot': snapshot.name, 'independent_restore': True}))
    temporary = root / 'latest.json.tmp'
    temporary.write_text(json.dumps({'snapshot': snapshot.name}))
    os.replace(str(temporary), str(root / 'latest.json'))
    print('PRIVATE_SNAPSHOT_SEEDED', snapshot.name, flush=True)
    return snapshot


def create_snapshot(app, root, label):
    app, root = Path(app), Path(root)
    reject_symlink_parents(root)
    if root.is_symlink() or app.is_symlink() or root.resolve() == app.resolve() or app.resolve() in root.resolve().parents:
        raise ValueError('Unsafe private snapshot root')
    root.mkdir(mode=0o700, parents=True, exist_ok=True)
    root.chmod(0o700)
    previous = previous_snapshot(root)
    snapshot = root / ('snapshot-' + str(int(time.time() * 1000000)))
    snapshot.mkdir(mode=0o700)
    files = snapshot / 'files'
    files.mkdir(mode=0o700)
    entries = private_entries(app)
    if '.env' not in entries:
        raise ValueError('Private snapshot requires application environment')
    # NUL-separated paths handle spaces/newlines; no shell or key data in logs.
    command = ['rsync', '--archive', '--recursive', '--relative', '--from0',
               '--files-from=-', '--modify-window=-1', '--stats']
    if previous:
        command.append('--link-dest=' + str((previous / 'files').resolve()))
    command += [str(app.resolve()) + '/', str(files.resolve()) + '/']
    started = time.monotonic()
    result = subprocess.run(command, input=('\0'.join(entries) + '\0').encode(),
                            stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=1800)
    # A vanished/changed file is a failure: callers must stop the writer first.
    if result.returncode:
        (snapshot / 'rsync-error.log').write_bytes(result.stderr)
        raise RuntimeError('Private snapshot failed; incomplete snapshot retained for inspection')
    (snapshot / 'rsync-stats.log').write_bytes(result.stdout)
    report = {'label': label, 'snapshot': snapshot.name,
              'previous': previous.name if previous else None,
              'seconds': round(time.monotonic() - started, 2),
              'entries': entries, 'independent_restore': True}
    (snapshot / 'COMPLETE.json').write_text(json.dumps(report))
    # Publish only after the entire snapshot succeeds; preserve the last good one.
    temporary = root / 'latest.json.tmp'
    temporary.write_text(json.dumps({'snapshot': snapshot.name}))
    os.replace(str(temporary), str(root / 'latest.json'))
    print('PRIVATE_SNAPSHOT_COMPLETE', snapshot.name, 'seconds=' + str(report['seconds']),
          'incremental=' + str(previous is not None), flush=True)
    return snapshot


def prune_snapshots(root, days=7):
    """User-approved retention: seven days, at least two newest complete backups."""
    root = Path(root)
    reject_symlink_parents(root)
    latest = previous_snapshot(root)
    if latest is None:
        return []
    candidates = [p for p in root.iterdir()
                  if re.fullmatch(r'snapshot-(?:seed-)?[0-9]+', p.name)
                  and not p.is_symlink() and p.is_dir()
                  and not (p / 'COMPLETE.json').is_symlink()
                  and (p / 'COMPLETE.json').is_file()]
    candidates.sort(key=lambda p: (p / 'COMPLETE.json').stat().st_mtime, reverse=True)
    removed = []
    for candidate in candidates[2:]:
        if candidate == latest or (candidate / 'COMPLETE.json').stat().st_mtime > time.time() - days * 86400:
            continue
        reject_symlink_parents(candidate)
        if candidate.resolve().parent != root.resolve():
            raise ValueError('Snapshot retention escaped root')
        shutil.rmtree(str(candidate))
        removed.append(candidate.name)
    return removed


if __name__ == '__main__':
    import argparse
    import fcntl
    parser = argparse.ArgumentParser()
    modes = parser.add_mutually_exclusive_group(required=True)
    modes.add_argument('--seed-archive', type=Path)
    modes.add_argument('--prune', action='store_true')
    arguments = parser.parse_args()
    lock = open('/home/jeblast/repos/.doran-cd.lock', 'a')
    try:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        print('PRIVATE_SNAPSHOT_BUSY_SKIP')
        raise SystemExit(0)
    root = Path('/home/jeblast/backups/private-snapshots')
    if arguments.prune:
        print(json.dumps({'private_snapshots_removed': prune_snapshots(root)}))
    else:
        seed_from_archive(arguments.seed_archive, root)

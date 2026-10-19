"""Explicitly audit, then remove inactive build copies. Never follow symlinks."""
from pathlib import Path
import json
import os
import shutil
import subprocess
import sys
import time

root = Path('/home/jeblast/repos').resolve()
app = root / 'doran-whatsapp-server'
plan = Path('/home/jeblast/backups/repo-stage-cleanup-plan-20261015.json')


def validate(target):
    assert target.parent == root and target.resolve().parent == root
    assert not target.is_symlink() and target.is_dir() and target != app
    assert target.name.startswith(('.doran-', '.dispatch-incident-build-'))
    assert (target / 'src').is_dir() and (target / 'package.json').is_file()
    assert not (target / '.git').exists(), 'Git checkout must be preserved'


def used_paths():
    used = []
    for proc in Path('/proc').iterdir():
        if not proc.name.isdigit(): continue
        for child in ['cwd', 'exe']:
            try: used.append(Path(os.readlink(str(proc / child))))
            except OSError: pass
        try:
            for fd in (proc / 'fd').iterdir():
                try: used.append(Path(os.readlink(str(fd))))
                except OSError: pass
        except OSError: pass
        try:
            for arg in (proc / 'cmdline').read_bytes().split(b'\0'):
                if arg.startswith(b'/home/jeblast/repos/'): used.append(Path(os.fsdecode(arg)))
        except OSError: pass
    # Ensure the live checkout does not depend on any staging symlink.
    for directory, dirs, files in os.walk(str(app), followlinks=False):
        for name in dirs + files:
            link = Path(directory) / name
            if link.is_symlink(): used.append(link.resolve())
    return used


if '--apply' not in sys.argv:
    paths = used_paths()
    entries = []
    for target in sorted(root.iterdir()):
        if not target.name.startswith(('.doran-', '.dispatch-incident-build-')): continue
        validate(target)
        assert not any(p == target or target in p.parents for p in paths), 'Active path: ' + str(target)
        entries.append({'name': target.name, 'inode': target.stat().st_ino,
            'kib': int(subprocess.check_output(['du', '-sk', str(target)]).split()[0])})
    plan.write_text(json.dumps({'root': str(root), 'entries': entries}, indent=2))
    print('AUDITED_INACTIVE_BUILD_COPIES', len(entries), 'MIB', round(sum(e['kib'] for e in entries) / 1024, 1))
    print('PLAN', plan)
else:
    data = json.loads(plan.read_text())
    assert data['root'] == str(root)
    paths = used_paths()
    for entry in data['entries']:
        target = root / entry['name']
        validate(target)
        assert target.stat().st_ino == entry['inode'], 'Directory changed since audit'
        assert not any(p == target or target in p.parents for p in paths), 'Active path: ' + str(target)
    for entry in data['entries']:
        target = root / entry['name']
        validate(target)
        shutil.rmtree(str(target))
    print('REMOVED_INACTIVE_BUILD_COPIES', len(data['entries']))
    print('REMAINING_DIRECTORIES', json.dumps([p.name for p in root.iterdir() if p.is_dir()]))

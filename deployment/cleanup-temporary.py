from pathlib import Path
import json
import os
import shutil
import time

app = Path('/home/jeblast/repos/doran-whatsapp-server').resolve()
backup = Path('/home/jeblast/backups/doran-update-20261009').resolve()
records = []
opened = set()
for proc in Path('/proc').iterdir():
    if not proc.name.isdigit():
        continue
    try:
        if proc.stat().st_uid != os.getuid():
            continue
        for fd in (proc / 'fd').iterdir():
            try:
                opened.add(fd.resolve())
            except OSError:
                pass
    except OSError:
        pass

def delete_file(p, category):
    if p.is_symlink() or not p.is_file() or p.resolve() in opened:
        return
    size = p.stat().st_size
    p.unlink()
    records.append({'category': category, 'path': str(p), 'bytes': size})

for root, age in [(app / 'storage/logs', 30 * 86400), (Path('/home/jeblast/.pm2/logs'), 86400)]:
    root = root.resolve()
    links = {p.resolve() for p in root.rglob('*') if p.is_symlink()}
    for p in root.rglob('*'):
        if p.is_symlink() or not p.is_file() or p.resolve() in links:
            continue
        if '.log' not in p.name:
            continue
        if root.name == 'logs' and '.pm2' in str(root):
            if not (p.name.startswith('doran-whatsapp-') and '__' in p.name):
                continue
        if p.stat().st_mtime < time.time() - age:
            delete_file(p, 'old_logs')

for name in ['b.zip', 'build.zip']:
    delete_file(app / name, 'old_build_archives')

def delete_tree(p, allowed_parent, category):
    if p.is_symlink() or not p.exists():
        return
    resolved = p.resolve()
    if resolved.parent != allowed_parent.resolve():
        raise RuntimeError('Unexpected cleanup target: ' + str(resolved))
    size = sum(f.stat().st_size for f in resolved.rglob('*') if f.is_file() and not f.is_symlink())
    shutil.rmtree(str(resolved))
    records.append({'category': category, 'path': str(resolved), 'bytes': size})

delete_tree(app / '.next/cache/webpack', app / '.next/cache', 'build_cache')
if (backup / 'runtime-before.tar.gz').stat().st_size > 0:
    delete_tree(backup / 'previous-runtime', backup, 'old_runtime_copy')
delete_tree(Path('/home/jeblast/repos/.doran-maintenance-20261009'), Path('/home/jeblast/repos'), 'staging')

for name in ['doran-audit-before.json', 'doran-audit-stage.json', 'doran-next15-metadata.json', 'doran-lockfile-check.log']:
    delete_file(Path('/home/jeblast/.pm2') / name, 'task_temp')

report = {'removed_files_or_trees': len(records), 'bytes_removed': sum(r['bytes'] for r in records), 'records': records}
(backup / 'cleanup-manifest.json').write_text(json.dumps(report, indent=2) + '\n')
print(json.dumps({k: report[k] for k in ['removed_files_or_trees', 'bytes_removed']}))

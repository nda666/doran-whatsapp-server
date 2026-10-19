"""Retain one previous application deploy; keep session/data and unrelated backups."""
import json
import os
import shutil
from pathlib import Path


def retention_plan(root, keep):
    root, keep = Path(root).resolve(), Path(keep)
    if root.name != 'backups' or keep.is_symlink() or keep.resolve().parent != root or not keep.is_dir():
        raise ValueError('Invalid backup retention target')
    if not (keep / 'runtime/.next/BUILD_ID').is_file() or not (keep / 'runtime/dist').is_dir():
        raise ValueError('The retained backup must contain a complete previous runtime')
    targets = []
    used = []
    proc_root = Path('/proc')
    if proc_root.is_dir():
        for proc in proc_root.iterdir():
            if not proc.name.isdigit(): continue
            links = [proc / 'cwd', proc / 'exe']
            try: links.extend((proc / 'fd').iterdir())
            except OSError: pass
            for link in links:
                try: used.append(Path(os.readlink(str(link))))
                except OSError: pass
    for p in sorted(root.iterdir()):
        if p == keep or not p.is_dir() or p.is_symlink(): continue
        if not p.name.startswith(('doran-', 'dispatch-incident-')): continue
        if p.resolve().parent != root: raise ValueError('Backup outside retention root')
        if any(x == p or p in x.parents for x in used): continue
        targets.append(p)
    return targets


def prune_deploy_backups(root, keep):
    root, keep = Path(root).resolve(), Path(keep).resolve()
    targets = retention_plan(root, keep)
    report = {'kept': str(keep), 'removed': [p.name for p in targets]}
    # Save the exact deletion set before deleting any old version.
    (root / 'deploy-backup-retention.json').write_text(json.dumps(report, indent=2))
    for p in targets:
        if p.is_symlink() or p.resolve().parent != root or p == keep: raise ValueError('Backup target changed')
        data_files = [x for x in p.iterdir() if 'session' in x.name.lower() or x.name.lower().startswith('storage') or x.name.endswith(('.sql', '.sql.gz', '.dump')) or x.name == 'whatsapp-auth']
        if data_files:
            data_root = root / 'data-backups'
            if data_root.is_symlink(): raise ValueError('Unsafe data archive root')
            data_root.mkdir(mode=0o700, exist_ok=True)
            destination = data_root / p.name
            if destination.is_symlink() or destination.resolve().parent != data_root.resolve(): raise ValueError('Unsafe data archive destination')
            destination.mkdir(mode=0o700, exist_ok=True)
            for name in ['.env', 'migration.log']:
                if (p / name).exists(): data_files.append(p / name)
            for source in data_files:
                target = destination / source.name
                if target.exists() or target.is_symlink(): raise ValueError('Data archive already exists')
                source.rename(target)
        shutil.rmtree(str(p))
    print('PREVIOUS_DEPLOY_BACKUP_RETAINED', keep.name, 'OLD_VERSIONS_REMOVED', len(targets), flush=True)
    return report

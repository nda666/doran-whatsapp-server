"""Read-only inventory. Never reads or prints WhatsApp key contents/identifiers."""
import collections
import json
import os
from pathlib import Path
import subprocess
import time

APP = Path('/home/jeblast/repos/doran-whatsapp-server')


def main():
    started = time.monotonic()
    query = """require('@next/env').loadEnvConfig(process.cwd(),false,{info(){},error(){}});
const {PrismaClient}=require('@prisma/client');const db=new PrismaClient();
db.phone.findMany({select:{id:true,userId:true}}).then(rows=>process.stdout.write(JSON.stringify(rows.map(p=>p.userId+'-'+p.id)))).catch(()=>process.exitCode=1).finally(()=>db.$disconnect());"""
    registered = set(json.loads(subprocess.check_output(['node', '-e', query], cwd=str(APP))))
    summary = {'registered_devices': len(registered), 'folders': [], 'file_types': {}}
    types = collections.Counter()
    prefixes = ['app-state-sync-version', 'app-state-sync-key', 'sender-key-memory',
                'sender-key', 'pre-key', 'session', 'lid-mapping', 'device-list']
    root = APP / 'storage/whatsapp-auth'
    for index, folder in enumerate(sorted(root.iterdir())):
        if folder.is_symlink() or not folder.is_dir():
            continue
        counts = collections.Counter()
        pending = [str(folder)]
        while pending:
            with os.scandir(pending.pop()) as entries:
                for entry in entries:
                    if entry.is_symlink():
                        counts['symlink'] += 1
                    elif entry.is_dir(follow_symlinks=False):
                        pending.append(entry.path)
                    elif entry.is_file(follow_symlinks=False):
                        kind = next((p for p in prefixes if entry.name.startswith(p + '-')), 'other')
                        if entry.name == 'creds.json':
                            kind = 'creds'
                        counts[kind] += 1
        types.update(counts)
        summary['folders'].append({'index': index, 'registered': folder.name in registered,
                                   'files': sum(counts.values()), 'types': dict(counts)})
    summary['file_types'] = dict(types)
    summary['seconds'] = round(time.monotonic() - started, 2)
    print(json.dumps(summary, indent=2))


if __name__ == '__main__':
    main()

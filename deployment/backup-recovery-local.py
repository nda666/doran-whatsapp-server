"""Read-only VPS recovery snapshot. Never prints secret values or database rows."""
from pathlib import Path
import datetime
import hashlib
import io
import json
import subprocess
import zipfile

ROOT = Path(__file__).resolve().parent.parent
REMOTE = r'''
from pathlib import Path
import hashlib, io, json, os, subprocess, sys, zipfile
app = Path('/home/jeblast/repos/doran-whatsapp-server')
os.chdir(app)
node = '/home/jeblast/.local/share/doran-node/node-v24.21.0-linux-x64/bin/node'
dump_js = r"""
require('@next/env').loadEnvConfig(process.cwd(), false);
const {spawnSync}=require('node:child_process');
const u=new URL(process.env.DATABASE_URL);
const r=spawnSync('/usr/bin/mysqldump',['--no-data','--routines','--triggers','--events','--skip-lock-tables','--host='+u.hostname,'--port='+(u.port||'3306'),'--user='+decodeURIComponent(u.username),decodeURIComponent(u.pathname.slice(1))],{env:{...process.env,MYSQL_PWD:decodeURIComponent(u.password)},maxBuffer:32*1024*1024});
if(r.status!==0)process.exit(1);process.stdout.write(r.stdout);
"""
meta_js = r"""
require('@next/env').loadEnvConfig(process.cwd(), false);
const {PrismaClient}=require('@prisma/client');const p=new PrismaClient();
(async()=>{const migrations=await p.$queryRawUnsafe('SELECT migration_name,checksum,finished_at,rolled_back_at FROM _prisma_migrations ORDER BY migration_name');const tables=await p.$queryRawUnsafe('SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() ORDER BY TABLE_NAME');const version=await p.$queryRawUnsafe('SELECT VERSION() AS version');process.stdout.write(JSON.stringify({migrations,tables,version}));})().catch(()=>{process.exitCode=1}).finally(()=>p.$disconnect());
"""
dump = subprocess.run([node,'-e',dump_js],stdout=subprocess.PIPE,stderr=subprocess.PIPE)
meta = subprocess.run([node,'-e',meta_js],stdout=subprocess.PIPE,stderr=subprocess.PIPE)
if dump.returncode or meta.returncode:
    sys.stderr.write('EXPORT_STATUS dump='+str(dump.returncode)+' metadata='+str(meta.returncode)+'\n');sys.exit(1)
manifest = {}
buf = io.BytesIO()
with zipfile.ZipFile(buf,'w',zipfile.ZIP_DEFLATED) as z:
    files = list((app/'prisma').rglob('*')) + [app/'ecosystem.config.js']
    files += [app/name for name in ['.env','.env.production','.env.local','.env.production.local'] if (app/name).is_file()]
    assert (app/'.env').is_file()
    for path in files:
        if not path.is_file():continue
        name = path.relative_to(app).as_posix();data=path.read_bytes()
        z.writestr(name,data);manifest[name]=hashlib.sha256(data).hexdigest()
    z.writestr('database-schema.sql',dump.stdout)
    z.writestr('database-metadata.json',meta.stdout)
    z.writestr('manifest.json',json.dumps(manifest,indent=2))
sys.stdout.buffer.write(buf.getvalue())
'''

def main():
    stamp = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ')
    destination = ROOT / '.recovery' / stamp
    destination.mkdir(parents=True, exist_ok=False)
    command = ['ssh','-o','BatchMode=yes','-o','ConnectTimeout=15','-i',str(Path.home()/'.ssh/codex_wa_server_ed25519'),'jeblast@103.196.146.186','python3 -']
    result = subprocess.run(command,input=REMOTE.encode(),capture_output=True)
    if result.returncode:
        import re
        safe = re.search(rb'EXPORT_STATUS dump=\d+ metadata=\d+', result.stderr)
        if safe: print(safe.group().decode())
        print('SSH_EXIT', result.returncode)
        raise SystemExit('SSH snapshot failed; remote output suppressed to protect secrets.')
    with zipfile.ZipFile(io.BytesIO(result.stdout)) as archive:
        for name in archive.namelist():
            target=(destination/name).resolve()
            assert target.is_relative_to(destination.resolve())
        archive.extractall(destination)
    manifest=json.loads((destination/'manifest.json').read_text())
    for name,digest in manifest.items():
        assert hashlib.sha256((destination/name).read_bytes()).hexdigest()==digest
    # Keep an existing local configuration intact unless it already matches production.
    env_installed=[]
    env_conflicts=[]
    for name in manifest:
        if not name.startswith('.env'):continue
        source=destination/name;target=ROOT/name
        if target.exists() and target.read_bytes()!=source.read_bytes():
            env_conflicts.append(name)
        else:
            target.write_bytes(source.read_bytes());env_installed.append(name)
    local_migrations={p.parent.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in (ROOT/'prisma/migrations').glob('*/migration.sql')}
    live_migrations={p.parent.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in (destination/'prisma/migrations').glob('*/migration.sql')}
    metadata=json.loads((destination/'database-metadata.json').read_text())
    applied={m['migration_name']:m['checksum'] for m in metadata['migrations'] if m['finished_at'] and not m['rolled_back_at']}
    report={
        'snapshot':str(destination),
        'env_installed':env_installed,'env_conflicts':env_conflicts,
        'local_migration_count':len(local_migrations),'live_migration_count':len(live_migrations),
        'applied_migration_count':len(applied),'table_count':len(metadata['tables']),
        'missing_local_migrations':sorted(set(live_migrations)-set(local_migrations)),
        'local_live_mismatch':sorted(k for k in live_migrations if local_migrations.get(k)!=live_migrations[k]),
        'applied_checksum_mismatch':sorted(k for k in applied if local_migrations.get(k)!=applied[k]),
        'unfinished_migrations':[m['migration_name'] for m in metadata['migrations'] if not m['finished_at'] and not m['rolled_back_at']],
        'schema_matches_live':(ROOT/'prisma/schema.prisma').read_bytes()==(destination/'prisma/schema.prisma').read_bytes(),
        'database_schema_sha256':hashlib.sha256((destination/'database-schema.sql').read_bytes()).hexdigest(),
    }
    (destination/'verification.json').write_text(json.dumps(report,indent=2))
    print(json.dumps(report,indent=2))

if __name__=='__main__':main()

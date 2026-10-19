from pathlib import Path
import os, json, shutil, subprocess, time, urllib.request

app = Path('/home/jeblast/repos/doran-whatsapp-server').resolve()
stage = Path('/home/jeblast/repos/.doran-marketing-20261010').resolve()
backup = Path('/home/jeblast/backups/doran-marketing-20261010').resolve()
assert app.parent == stage.parent == Path('/home/jeblast/repos')
assert backup.parent == Path('/home/jeblast/backups')
assert (stage / '.next/BUILD_ID').is_file()
assert (backup / 'config-source-before.tar.gz').stat().st_size > 0
node_dir = '/home/jeblast/.local/share/doran-node/node-v24.21.0-linux-x64/bin'
os.environ['PATH'] = node_dir + ':' + os.environ['PATH']
node = node_dir + '/node'

def pm2(*args):
    subprocess.run(['/usr/local/bin/pm2'] + list(args), cwd=str(app), check=True, stdout=subprocess.DEVNULL)

def ready():
    for attempt in range(30):
        try:
            with urllib.request.urlopen('http://127.0.0.1:3000/signin', timeout=3) as r:
                if r.status == 200: return True
        except Exception: pass
        time.sleep(1)
    return False

items = ['src', 'public', 'prisma', 'node_modules', '.next', 'dist']
files = ['package.json', 'package-lock.json', 'next.config.js', 'next-i18next.config.js', 'next-env.d.ts', 'tsconfig.json', 'tsconfig.server.json', '.eslintrc.json', 'ecosystem.config.js']
previous = backup / 'previous-runtime'
assert not previous.exists()
previous.mkdir(mode=0o700)
moved_old, moved_new = [], []
pm2('stop', 'doran-whatsapp')
try:
    with open(str(backup / 'database-before.sql'), 'wb') as out:
        os.chmod(str(backup / 'database-before.sql'), 0o600)
        js = """require('@next/env').loadEnvConfig(process.cwd());
const {spawnSync}=require('node:child_process');
const u=new URL(process.env.DATABASE_URL);
const r=spawnSync('/usr/bin/mysqldump',['--single-transaction','--quick','--skip-lock-tables','--host='+u.hostname,'--port='+(u.port||'3306'),'--user='+decodeURIComponent(u.username),decodeURIComponent(u.pathname.slice(1))],{env:{...process.env,MYSQL_PWD:decodeURIComponent(u.password)},stdio:['ignore',1,'pipe']});
if(r.status!==0){console.error('Database backup failed; credentials and diagnostic output withheld');process.exit(1)}
"""
        subprocess.run([node, '-e', js], cwd=str(app), stdout=out, check=True)
    assert (backup / 'database-before.sql').stat().st_size > 0
    subprocess.run(['tar', '-czf', str(backup / 'storage-before.tar.gz'), 'storage'], cwd=str(app), check=True)
    os.chmod(str(backup / 'storage-before.tar.gz'), 0o600)
    with open(str(backup / 'migration.log'), 'w') as log:
        subprocess.run([node, 'node_modules/prisma/build/index.js', 'migrate', 'deploy'], cwd=str(stage), stdout=log, stderr=subprocess.STDOUT, check=True)
    print('DATABASE_AND_STORAGE_BACKUP_OK_MIGRATION_APPLIED', flush=True)
    for name in items:
        if (app / name).exists():
            os.rename(str(app / name), str(previous / name)); moved_old.append(name)
        os.rename(str(stage / name), str(app / name)); moved_new.append(name)
    for name in files: shutil.copy2(str(stage / name), str(app / name))
    for source in (stage / 'deployment').iterdir():
        if source.is_file(): shutil.copy2(str(source), str(app / 'deployment' / source.name))
    js = """require('@next/env').loadEnvConfig(process.cwd());const{PrismaClient}=require('@prisma/client');const p=new PrismaClient();
(async()=>{const users=await p.user.findMany({select:{id:true,role:true,_count:{select:{phones:true}}}});const count=await p.phone.count();
if(users.length===1&&users[0]._count.phones===count&&count>0){await p.user.update({where:{id:users[0].id},data:{role:'ADMIN'}});console.log('SOLE_EXISTING_DEVICE_OWNER_ADMIN_ENABLED')}else{console.log('ADMIN_BOOTSTRAP_REQUIRES_OWNER_SELECTION')}
await p.$disconnect()})().catch(()=>{console.error('Admin bootstrap failed');process.exit(1)})"""
    subprocess.run([node, '-e', js], cwd=str(app), check=True)
    pm2('startOrReload', 'ecosystem.config.js', '--only', 'doran-whatsapp', '--update-env')
    if not ready(): raise RuntimeError('Dashboard startup failed')
except Exception:
    pm2('stop', 'doran-whatsapp')
    for name in moved_new: os.rename(str(app / name), str(stage / name))
    for name in moved_old: os.rename(str(previous / name), str(app / name))
    subprocess.run(['tar', '-xzf', str(backup / 'config-source-before.tar.gz'), '-C', str(app)], check=True)
    pm2('startOrReload', 'ecosystem.config.js', '--only', 'doran-whatsapp', '--update-env')
    print('SOURCE_RUNTIME_ROLLED_BACK_ADDITIVE_DATABASE_PRESERVED', flush=True)
    raise
pm2('save')
dump = Path('/home/jeblast/.pm2/dump.pm2')
current = json.loads(dump.read_text()); old = json.loads((backup / 'pm2-dump-before.json').read_text())
names = {item['name'] for item in current}
current.extend(item for item in old if item['name'] not in names)
dump.write_text(json.dumps(current, indent=2) + '\n'); dump.chmod(0o600)
print('MARKETING_UPGRADE_LIVE_LOGIN_OK_PM2_SAVED', flush=True)

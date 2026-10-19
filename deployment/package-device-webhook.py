from pathlib import Path
import tarfile
import zipfile
import json
import difflib

root = Path(__file__).resolve().parent.parent
baseline = root / 'deployment/device-webhook-baseline-20261010.tar.gz'
new = [
 'prisma/migrations/20261010100000_device_change_webhook/migration.sql',
 'src/pages/api/admin/device-webhook.ts', 'src/components/phone/DeviceWebhookSettings.tsx',
 'src/server/deviceWebhook/events.ts', 'src/server/deviceWebhook/worker.ts',
 'deployment/verify-device-webhook.cjs', 'deployment/verify-device-webhook-db.cjs',
 'deployment/verify-device-webhook-live.cjs', 'deployment/device-webhook-api.md',
]
with tarfile.open(baseline) as archive:
    existing = [item.name for item in archive.getmembers() if item.isfile()]
    changed = existing + new
    with zipfile.ZipFile(root / 'deployment/device-webhook-upload-20261010.zip', 'w', zipfile.ZIP_DEFLATED) as z:
        diffs = []
        for name in existing:
            old = archive.extractfile(name).read()
            z.writestr('baseline/' + name, old)
            diffs.extend(difflib.unified_diff(old.decode().splitlines(True), (root / name).read_text().splitlines(True), fromfile='live/' + name, tofile=name))
        for name in changed: z.write(root / name, name)
    (root / 'deployment/device-webhook-source.diff').write_text(''.join(diffs), encoding='utf-8')

prepare = (root / 'deployment/prepare-phone-token-20261010.py').read_text().replace('phone-token', 'device-webhook')
start, end = prepare.index('changed = '), prepare.index('\nfor name in changed:')
prepare = prepare[:start] + 'changed = ' + repr(changed) + prepare[end:]
prepare = prepare.replace("with (backup / 'build.log').open('w') as log:\n", "with (backup / 'build.log').open('w') as log:\n    subprocess.run(['node', 'node_modules/prisma/build/index.js', 'generate'], cwd=stage, env=env, stdout=log, stderr=subprocess.STDOUT, check=True)\n")
prepare = prepare.replace("    subprocess.run(['npm', 'run', 'build']", "    subprocess.run(['node', 'deployment/verify-phone-token.cjs'], cwd=stage, env=env, stdout=log, stderr=subprocess.STDOUT, check=True)\n    subprocess.run(['node', 'deployment/verify-phone-ownership.cjs'], cwd=stage, env=env, stdout=log, stderr=subprocess.STDOUT, check=True)\n    subprocess.run(['node', 'deployment/verify-registered-phones.cjs'], cwd=stage, env=env, stdout=log, stderr=subprocess.STDOUT, check=True)\n    subprocess.run(['npm', 'run', 'build']")
(root / 'deployment/prepare-device-webhook-20261010.py').write_text(prepare)

deploy = (root / 'deployment/deploy-phone-token-20261010.py').read_text().replace('phone-token', 'device-webhook')
marker = "try:\n    for name in ['.next', 'dist']:"
database_step = '''try:
    # Backup before an additive migration; credentials remain in process memory only.
    js = """require('@next/env').loadEnvConfig(process.cwd());const{spawnSync}=require('node:child_process');const u=new URL(process.env.DATABASE_URL);
const r=spawnSync('/usr/bin/mysqldump',['--single-transaction','--quick','--skip-lock-tables','--host='+u.hostname,'--port='+(u.port||'3306'),'--user='+decodeURIComponent(u.username),decodeURIComponent(u.pathname.slice(1))],{env:{...process.env,MYSQL_PWD:decodeURIComponent(u.password)},stdio:['ignore',1,'pipe']});
if(r.status!==0){console.error('Database backup failed; diagnostics withheld');process.exit(1)}"""
    with (backup / 'database-before.sql').open('wb') as out:
        os.chmod(backup / 'database-before.sql', 0o600)
        subprocess.run(['node', '-e', js], cwd=app, stdout=out, check=True)
    assert (backup / 'database-before.sql').stat().st_size > 0
    with (backup / 'migration.log').open('w') as log:
        subprocess.run(['node', 'node_modules/prisma/build/index.js', 'migrate', 'deploy'], cwd=stage, stdout=log, stderr=subprocess.STDOUT, check=True)
    subprocess.run(['node', 'deployment/verify-device-webhook-db.cjs'], cwd=stage, check=True)
    for name in ['.next', 'dist']:'''
assert marker in deploy
deploy = deploy.replace(marker, database_step)
deploy = deploy.replace("    for name in changed:\n        if name in existing:", "    for name in changed:\n        # Preserve the additive migration and compatible schema on runtime rollback.\n        if name.startswith('prisma/'):\n            (app / name).parent.mkdir(parents=True, exist_ok=True)\n            shutil.copy2(str(stage / name), str(app / name))\n            continue\n        if name in existing:")
(root / 'deployment/deploy-device-webhook-20261010.py').write_text(deploy)
print('DEVICE_WEBHOOK_PACKAGE_READY', len(changed), 'files')

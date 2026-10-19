from pathlib import Path
import shutil

home = Path('/home/jeblast').resolve()
backup = home / 'backups/doran-device-webhook-20261010'
app = home / 'repos/doran-whatsapp-server'
assert (backup / 'previous-runtime/.next/BUILD_ID').is_file()
assert (backup / 'database-before.sql').stat().st_size > 0
assert (app / 'src/pages/api/admin/device-webhook.ts').is_file()
for target, parent in [(home / 'repos/.doran-device-webhook-20261010', home / 'repos'), (home / 'device-webhook-incoming-20261010', home)]:
    assert target.resolve().parent == parent.resolve() and not target.is_symlink()
    if target.exists(): shutil.rmtree(target)
for name in ['device-webhook-upload-20261010.zip', 'device-webhook-baseline-20261010.tar.gz', 'stage-device-webhook-20261010.py', 'prepare-device-webhook-20261010.py', 'deploy-device-webhook-20261010.py', 'cleanup-device-webhook-20261010.py']:
    target = home / name
    assert target.resolve().parent == home and not target.is_symlink()
    if target.exists(): target.unlink()
print('DEVICE_WEBHOOK_STAGING_REMOVED_DATABASE_AND_RUNTIME_BACKUPS_RETAINED')

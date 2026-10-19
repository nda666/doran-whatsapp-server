from pathlib import Path
import shutil

home = Path('/home/jeblast').resolve()
stage = home / 'repos/.doran-phone-token-20261010'
incoming = home / 'phone-token-incoming-20261010'
backup = home / 'backups/doran-phone-token-20261010'
assert (backup / 'previous-runtime/.next/BUILD_ID').is_file()
assert (home / 'repos/doran-whatsapp-server/src/pages/api/phones/generate-token.ts').is_file()
for target, parent in [(stage, home / 'repos'), (incoming, home)]:
    assert target.resolve().parent == parent.resolve() and not target.is_symlink()
    if target.exists(): shutil.rmtree(target)
for name in ['phone-token-upload-20261010.zip', 'stage-phone-token-20261010.py', 'prepare-phone-token-20261010.py', 'deploy-phone-token-20261010.py', 'cleanup-phone-token-20261010.py']:
    target = home / name
    assert target.resolve().parent == home and not target.is_symlink()
    if target.exists(): target.unlink()
print('PHONE_TOKEN_STAGING_REMOVED_BACKUP_RETAINED')

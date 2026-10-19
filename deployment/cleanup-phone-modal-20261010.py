from pathlib import Path
import shutil
stage=Path('/home/jeblast/repos/.doran-phone-modal-20261010')
assert stage.resolve() == stage and stage.parent == Path('/home/jeblast/repos') and not stage.is_symlink()
assert (Path('/home/jeblast/backups/doran-phone-modal-20261010') / 'previous-runtime/.next/BUILD_ID').is_file()
shutil.rmtree(str(stage))
for name in ['phone-modal-baseline-20261010.tar.gz','phone-modal-upload-20261010.zip','prepare-phone-modal-20261010.py','deploy-phone-modal-20261010.py','verify-phone-modal-live.cjs','cleanup-phone-modal-20261010.py']:
 p=Path('/tmp') / name
 if p.is_file(): p.unlink()
print('STAGING_REMOVED_BACKUP_RETAINED')

from pathlib import Path
import shutil
stage=Path('/home/jeblast/repos/.doran-phone-label-20261010')
assert stage.resolve() == stage and stage.parent == Path('/home/jeblast/repos') and not stage.is_symlink()
assert (Path('/home/jeblast/backups/doran-phone-label-20261010') / 'previous-runtime/.next/BUILD_ID').is_file()
shutil.rmtree(str(stage))
for name in ['phone-label-baseline-20261010.tar.gz','phone-label-upload-20261010.zip','prepare-phone-label-20261010.py','deploy-phone-label-20261010.py','verify-phone-label-live.cjs','cleanup-phone-label-20261010.py']:
 p=Path('/tmp') / name
 if p.is_file(): p.unlink()
print('STAGING_REMOVED_BACKUP_RETAINED')

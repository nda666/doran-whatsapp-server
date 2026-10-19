from pathlib import Path
import shutil
stage=Path('/home/jeblast/repos/.doran-action-edit-20261010')
assert stage.resolve() == stage and stage.parent == Path('/home/jeblast/repos') and not stage.is_symlink()
assert (Path('/home/jeblast/backups/doran-action-edit-20261010') / 'previous-runtime/.next/BUILD_ID').is_file()
shutil.rmtree(str(stage))
for name in ['action-edit-baseline-20261010.tar.gz','action-edit-upload-20261010.zip','prepare-action-edit-20261010.py','deploy-action-edit-20261010.py','verify-action-edit-live.cjs','cleanup-action-edit-20261010.py']:
 p=Path('/tmp') / name
 if p.is_file(): p.unlink()
print('STAGING_REMOVED_BACKUP_RETAINED')

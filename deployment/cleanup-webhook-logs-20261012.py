from pathlib import Path
import shutil
stage = Path('/home/jeblast/repos/.doran-webhook-logs-1791741085')
assert stage.parent == Path('/home/jeblast/repos')
assert stage.name == '.doran-webhook-logs-1791741085'
assert stage.resolve() == stage and not stage.is_symlink()
assert Path('/home/jeblast/backups/doran-webhook-logs-1791741085/runtime').is_dir()
if stage.exists():
    shutil.rmtree(stage)
print('STAGING_REMOVED_BACKUP_RETAINED')

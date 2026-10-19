from pathlib import Path
import shutil

targets = [
    Path('/home/jeblast/repos/.doran-api-toolkit-20261010'),
    Path('/home/jeblast/api-toolkit-incoming-20261010'),
]
for target in targets:
    assert not target.is_symlink()
    assert target.resolve() == target
    assert target.name in ['.doran-api-toolkit-20261010', 'api-toolkit-incoming-20261010']
    assert target.parent in [Path('/home/jeblast/repos'), Path('/home/jeblast')]
    if target.exists():
        shutil.rmtree(target)
archive = Path('/home/jeblast/api-toolkit-upload-20261010.zip')
assert not archive.is_symlink() and archive.resolve() == archive
if archive.exists():
    archive.unlink()
print('API_TOOLKIT_TEMPORARY_FILES_REMOVED_BACKUP_RETAINED')

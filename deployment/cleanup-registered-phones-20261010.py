from pathlib import Path
import shutil

targets = [
    Path('/home/jeblast/repos/.doran-registered-phones-20261010'),
    Path('/home/jeblast/registered-phones-incoming-20261010'),
]
for target in targets:
    assert not target.is_symlink()
    assert target.resolve() == target
    assert target.name in ['.doran-registered-phones-20261010', 'registered-phones-incoming-20261010']
    assert target.parent in [Path('/home/jeblast/repos'), Path('/home/jeblast')]
    if target.exists():
        shutil.rmtree(target)
archive = Path('/home/jeblast/registered-phones-upload-20261010.zip')
assert not archive.is_symlink() and archive.resolve() == archive
if archive.exists():
    archive.unlink()
print('REGISTERED_PHONES_TEMPORARY_FILES_REMOVED_BACKUP_RETAINED')

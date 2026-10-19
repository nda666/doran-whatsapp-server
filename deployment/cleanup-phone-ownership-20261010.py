from pathlib import Path
import shutil

targets = [
    Path('/home/jeblast/repos/.doran-phone-ownership-20261010'),
    Path('/home/jeblast/phone-ownership-incoming-20261010'),
]
for target in targets:
    assert not target.is_symlink()
    assert target.resolve() == target
    assert target.name in ['.doran-phone-ownership-20261010', 'phone-ownership-incoming-20261010']
    assert target.parent in [Path('/home/jeblast/repos'), Path('/home/jeblast')]
    if target.exists():
        shutil.rmtree(target)
archive = Path('/home/jeblast/phone-ownership-upload-20261010.zip')
assert not archive.is_symlink() and archive.resolve() == archive
if archive.exists():
    archive.unlink()
print('PHONE_OWNERSHIP_TEMPORARY_FILES_REMOVED_BACKUP_RETAINED')

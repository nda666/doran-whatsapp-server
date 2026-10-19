from pathlib import Path
import zipfile
import subprocess

incoming = Path('/home/jeblast/phone-token-incoming-20261010')
assert not incoming.exists()
incoming.mkdir(mode=0o700)
with zipfile.ZipFile('/home/jeblast/phone-token-upload-20261010.zip') as archive:
    for name in archive.namelist():
        assert not name.startswith('/') and '..' not in Path(name).parts
    archive.extractall(incoming)
subprocess.run(['python3', '/home/jeblast/prepare-phone-token-20261010.py'], check=True)

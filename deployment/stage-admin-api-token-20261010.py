from pathlib import Path
import zipfile, shutil, subprocess
app=Path('/home/jeblast/repos/doran-whatsapp-server')
incoming=Path('/home/jeblast/admin-api-token-incoming-20261010')
assert not incoming.exists()
incoming.mkdir(mode=0o700)
with zipfile.ZipFile('/home/jeblast/admin-api-token-upload-20261010.zip') as z:
    for name in z.namelist():
        assert not name.startswith('/') and '..' not in Path(name).parts
        source=app/name
        if source.exists():
            target=incoming/'baseline'/name
            target.parent.mkdir(parents=True,exist_ok=True)
            shutil.copy2(source,target)
    z.extractall(incoming)
old=(app/'src/server/registeredPhones.ts').read_text()
new=(incoming/'src/server/registeredPhones.ts').read_text()
expected=old.replace('// Never expose device tokens or QR credentials in the device directory.', '// Tokens are selected only for the designated admin; QR credentials stay private.').replace('{ ...detailSelect, userId: true, user:', '{ ...detailSelect, token: true, userId: true, user:')
assert expected == new, 'Unexpected API change'
subprocess.run(['python3','/home/jeblast/prepare-admin-api-token-20261010.py'],check=True)

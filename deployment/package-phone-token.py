from pathlib import Path
import json
import zipfile

root = Path(__file__).resolve().parent.parent
changed = ['src/pages/dashboard/phone.tsx', 'src/lib/usePhoneData.ts', 'src/pages/api/phones/generate-token.ts', 'deployment/verify-phone-token.cjs', 'deployment/verify-phone-token-live.cjs']
prepare = (root / 'deployment/prepare-phone-ownership-20261010.py').read_text()
prepare = prepare.replace('phone-ownership', 'phone-token')
start = prepare.index('changed = ')
end = prepare.index('\nfor name in changed:', start)
prepare = prepare[:start] + 'changed = ' + repr(changed) + prepare[end:]
prepare = prepare.replace('verify-phone-token.cjs', 'verify-phone-token.cjs')
(root / 'deployment/prepare-phone-token-20261010.py').write_text(prepare)
deploy = (root / 'deployment/deploy-admin-api-token-20261010.py').read_text().replace('admin-api-token', 'phone-token')
deploy = deploy.replace("subprocess.run(['node', 'deployment/verify-registered-phones-live.cjs'], cwd=str(app), check=True)", "subprocess.run(['node', 'deployment/verify-phone-token-live.cjs'], cwd=str(app), check=True)")
(root / 'deployment/deploy-phone-token-20261010.py').write_text(deploy)
with zipfile.ZipFile(root / 'deployment/phone-token-upload-20261010.zip', 'w', zipfile.ZIP_DEFLATED) as archive:
    for name in changed:
        archive.write(root / name, name)
    archive.write(root / 'deployment/phone-token-live-phone-before.tsx', 'baseline/src/pages/dashboard/phone.tsx')
    archive.write(root / 'deployment/phone-token-live-hook-before.ts', 'baseline/src/lib/usePhoneData.ts')
print('PHONE_TOKEN_PACKAGE_READY')

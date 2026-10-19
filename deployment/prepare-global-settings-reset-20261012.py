from pathlib import Path
import base64, hashlib, json, subprocess, zipfile

root = Path(__file__).resolve().parent.parent
names = [
    'prisma/schema.prisma',
    'prisma/migrations/20261012170000_global_settings_password_reset/migration.sql',
    'src/components/Layout.tsx', 'src/styles/globals.css',
    'src/pages/api/profile.ts', 'src/pages/dashboard/profile.tsx',
    'src/pages/api/admin/users.ts', 'src/pages/dashboard/admin.tsx',
    'src/lib/globalSettings.ts', 'src/server/passwordReset.ts',
    'src/pages/api/admin/global-settings.ts', 'src/components/GlobalSettings.tsx',
    'src/pages/api/forgot-password.ts', 'src/pages/api/reset-password.ts',
    'src/pages/signin.tsx', 'src/pages/forgot-password.tsx', 'src/pages/reset-password.tsx',
    'deployment/initialize-postmark-setting.cjs',
    'deployment/verify-user-profile.cjs', 'deployment/verify-admin-user-token.cjs',
    'deployment/verify-super-admin-access.cjs',
    'deployment/verify-global-settings-password-reset.cjs',
    'deployment/verify-global-settings-reset-live.cjs',
    'deployment/check-global-settings-reset-migration.cjs',
    'deployment/global-settings-password-reset.md',
]
ssh = ['ssh', '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=15', '-i', str(Path.home()/'.ssh/codex_wa_server_ed25519'), 'jeblast@103.196.146.186']
script = "from pathlib import Path\nimport base64,json\napp=Path('/home/jeblast/repos/doran-whatsapp-server')\nnames="+repr(names)+"\nprint(json.dumps({name:base64.b64encode((app/name).read_bytes()).decode() if (app/name).is_file() else None for name in names}))\n"
result = subprocess.run(ssh + ['python3', '-'], input=script.encode(), capture_output=True, check=True)
snapshot = json.loads(result.stdout)
baseline = {}
before = root/'tmp/global-settings-reset-live-before'
before.mkdir(parents=True, exist_ok=True)
for name, encoded in snapshot.items():
    data = base64.b64decode(encoded) if encoded else None
    baseline[name] = hashlib.sha256(data).hexdigest() if data is not None else None
    if data is not None:
        target = before/name; target.parent.mkdir(parents=True, exist_ok=True); target.write_bytes(data)
    print(('EXISTING ' if data is not None else 'NEW      ')+name)
(root/'tmp/global-settings-reset-baseline.json').write_text(json.dumps(baseline, indent=2))
if '--snapshot-only' not in __import__('sys').argv:
    manifest = {}
    package = root/'deployment/global-settings-reset-20261012.zip'
    with zipfile.ZipFile(package, 'w', zipfile.ZIP_DEFLATED) as archive:
        for name in names:
            data = (root/name).read_bytes()
            archive.writestr(name, data); manifest[name] = hashlib.sha256(data).hexdigest()
        archive.writestr('manifest.json', json.dumps(manifest))
        archive.writestr('baseline.json', json.dumps(baseline))
    private = {}
    for line in (root/'.env').read_text(encoding='utf-8-sig').splitlines():
        if '=' in line:
            key, value = line.split('=', 1)
            if key in ['POSTMARK_SERVER_TOKEN', 'SETTINGS_ENCRYPTION_KEY']:
                private[key] = value.strip().strip('"').strip("'")
    assert all(private.get(key) for key in ['POSTMARK_SERVER_TOKEN', 'SETTINGS_ENCRYPTION_KEY'])
    secret_path = root/'.recovery/global-settings-reset-private.json'
    secret_path.parent.mkdir(exist_ok=True)
    secret_path.write_text(json.dumps(private))
    print('PACKAGE_READY', len(manifest), 'files; private config stored separately and excluded from archive')

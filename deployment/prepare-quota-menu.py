from pathlib import Path
import subprocess, json, hashlib, base64, zipfile

root = Path(__file__).resolve().parent.parent
names = ['src/lib/deviceQuota.ts', 'src/server/dispatch/settings.ts', 'src/server/messaging/safety.ts', 'src/pages/api/device-policies.ts', 'src/pages/api/admin/global-settings.ts', 'src/components/GlobalSettings.tsx', 'src/components/Layout.tsx', 'src/components/MessagingPreferences.tsx', 'src/components/RecipientSuppressions.tsx', 'src/pages/dashboard/admin.tsx', 'src/pages/dashboard/contacts.tsx', 'src/pages/dashboard/messaging-settings.tsx', 'src/pages/dashboard/device-health.tsx', 'prisma/schema.prisma', 'prisma/migrations/20261017050000_global_device_quota/migration.sql', 'deployment/verify-messaging-improvements.cjs', 'deployment/verify-messaging-db.cjs']
ssh = ['ssh', '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=15', '-i', str(Path.home() / '.ssh/codex_wa_server_ed25519'), 'jeblast@103.196.146.186']
remote = "from pathlib import Path\nimport json,hashlib\na=Path('/home/jeblast/repos/doran-whatsapp-server')\nnames=" + repr(names) + "\nprint(json.dumps({n:{'raw':hashlib.sha256((a/n).read_bytes()).hexdigest(),'normalized':hashlib.sha256((a/n).read_bytes().replace(b'\\r\\n',b'\\n')).hexdigest()} if (a/n).is_file() else None for n in names}))"
result = subprocess.run(ssh + ['python3', '-'], input=remote.encode(), capture_output=True, check=True)
hashes = json.loads(result.stdout)
changed = [n for n in names if hashes[n] is None or hashes[n]['normalized'] != hashlib.sha256((root/n).read_bytes().replace(b'\r\n', b'\n')).hexdigest()]
remote = "from pathlib import Path\nimport json,base64\na=Path('/home/jeblast/repos/doran-whatsapp-server')\nnames=" + repr(changed) + "\nprint(json.dumps({n:base64.b64encode((a/n).read_bytes()).decode() if (a/n).is_file() else None for n in names}))"
result = subprocess.run(ssh + ['python3', '-'], input=remote.encode(), capture_output=True, check=True)
before = json.loads(result.stdout)
manifest, baseline = {}, {}
with zipfile.ZipFile(root/'deployment/quota-menu-20261017.zip', 'w', zipfile.ZIP_DEFLATED) as archive:
    for name in changed:
        data = (root/name).read_bytes(); manifest[name] = hashlib.sha256(data).hexdigest()
        old = base64.b64decode(before[name]) if before[name] else None
        baseline[name] = hashlib.sha256(old).hexdigest() if old is not None else None
        if old is not None:
            saved = root/'tmp/quota-menu-live-before'/name; saved.parent.mkdir(parents=True, exist_ok=True); saved.write_bytes(old)
        archive.writestr(name, data)
    archive.writestr('manifest.json', json.dumps(manifest)); archive.writestr('baseline.json', json.dumps(baseline))
print(json.dumps({'files': changed, 'count': len(changed)}, indent=2))

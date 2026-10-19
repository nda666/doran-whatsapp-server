from pathlib import Path
import subprocess, json, hashlib, base64, zipfile

root = Path(__file__).resolve().parent.parent
names = [p.relative_to(root).as_posix() for p in (root / 'src').rglob('*') if p.suffix in ('.ts', '.tsx')]
names += ['next.config.js', 'package.json', 'package-lock.json', 'prisma/schema.prisma', 'public/locales/id/common.json', 'public/locales/id/upgrade.json', 'prisma/migrations/20261017020000_messaging_improvements/migration.sql', 'deployment/verify-messaging-improvements.cjs', 'deployment/verify-messaging-db.cjs']
ssh = ['ssh', '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=15', '-i', str(Path.home() / '.ssh/codex_wa_server_ed25519'), 'jeblast@103.196.146.186']
remote = "from pathlib import Path\nimport json,hashlib\na=Path('/home/jeblast/repos/doran-whatsapp-server')\nnames=" + repr(names) + "\nprint(json.dumps({n:{'raw':hashlib.sha256((a/n).read_bytes()).hexdigest(),'normalized':hashlib.sha256((a/n).read_bytes().replace(b'\\r\\n',b'\\n')).hexdigest()} if (a/n).is_file() else None for n in names}))"
result = subprocess.run(ssh + ['python3', '-'], input=remote.encode(), capture_output=True, check=True)
hashes = json.loads(result.stdout)
changed = [n for n in names if hashes[n] is None or hashes[n]['normalized'] != hashlib.sha256((root/n).read_bytes().replace(b'\r\n', b'\n')).hexdigest()]
remote = "from pathlib import Path\nimport json,base64\na=Path('/home/jeblast/repos/doran-whatsapp-server')\nnames=" + repr(changed) + "\nprint(json.dumps({n:base64.b64encode((a/n).read_bytes()).decode() if (a/n).is_file() else None for n in names}))"
result = subprocess.run(ssh + ['python3', '-'], input=remote.encode(), capture_output=True, check=True)
before = json.loads(result.stdout)
manifest, baseline = {}, {}
with zipfile.ZipFile(root/'deployment/messaging-improvements-20261017.zip', 'w', zipfile.ZIP_DEFLATED) as archive:
    for name in changed:
        data = (root/name).read_bytes(); manifest[name] = hashlib.sha256(data).hexdigest()
        old = base64.b64decode(before[name]) if before[name] else None
        baseline[name] = hashlib.sha256(old).hexdigest() if old is not None else None
        if old is not None:
            saved = root/'tmp/messaging-live-before'/name; saved.parent.mkdir(parents=True, exist_ok=True); saved.write_bytes(old)
        archive.writestr(name, data)
    archive.writestr('manifest.json', json.dumps(manifest)); archive.writestr('baseline.json', json.dumps(baseline))
print(json.dumps({'files': changed, 'count': len(changed)}, indent=2))

from pathlib import Path
import sys
sys.stdout.reconfigure(encoding="utf-8")
import base64
import difflib
import hashlib
import json
import subprocess
import zipfile

root = Path(__file__).resolve().parent.parent
names = ['src/server/ai/providers.ts', 'src/pages/api/ai-plugins/test.ts', 'src/pages/dashboard/ai-plugins.tsx', 'deployment/verify-ai-provider-errors.cjs']
ssh = ['ssh', '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=15', '-i', str(Path.home()/'.ssh/codex_wa_server_ed25519'), 'jeblast@103.196.146.186']
remote = "from pathlib import Path\nimport base64,json\na=Path('/home/jeblast/repos/doran-whatsapp-server')\nnames=" + repr(names) + "\nprint(json.dumps({n:base64.b64encode((a/n).read_bytes()).decode() if (a/n).is_file() else None for n in names}))"
result = subprocess.run(ssh + ['python3', '-'], input=remote.encode(), capture_output=True, check=True)
baseline, manifest = {}, {}
for name, encoded in json.loads(result.stdout).items():
    old = base64.b64decode(encoded) if encoded is not None else None
    baseline[name] = hashlib.sha256(old).hexdigest() if old is not None else None
    if old is not None:
        target = root/'tmp/ai-provider-errors-live-before'/name
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(old)
        print(''.join(difflib.unified_diff(old.decode().replace('\r\r\n', '\n').replace('\r\n', '\n').splitlines(True), (root/name).read_text(encoding='utf-8').splitlines(True), fromfile='live/'+name, tofile='local/'+name)))
with zipfile.ZipFile(root/'deployment/ai-provider-errors-20261016.zip', 'w', zipfile.ZIP_DEFLATED) as archive:
    for name in names:
        data = (root/name).read_bytes()
        manifest[name] = hashlib.sha256(data).hexdigest()
        archive.writestr(name, data)
    archive.writestr('baseline.json', json.dumps(baseline))
    archive.writestr('manifest.json', json.dumps(manifest))
print('PACKAGE_READY', len(names), 'files')

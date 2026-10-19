"""Snapshot live baselines and package the device delay range only."""
from pathlib import Path
import base64
import difflib
import hashlib
import json
import subprocess
import sys
import zipfile

sys.stdout.reconfigure(encoding='utf-8')
root = Path(__file__).resolve().parent
app = root.parent
names = ['src/components/MessagingPreferences.tsx', 'src/components/phone/DeviceWebhookSettings.tsx', 'src/components/phone/DispatchWebhookSettings.tsx', 'src/pages/dashboard/plans.tsx', 'src/pages/dashboard/admin.tsx']
remote = "from pathlib import Path\nimport base64,json\na=Path('/home/jeblast/repos/doran-whatsapp-server')\nnames=" + repr(names) + "\nprint(json.dumps({n:base64.b64encode((a/n).read_bytes()).decode() if (a/n).is_file() else None for n in names}))"
result = subprocess.run(['ssh', '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=15', '-i', str(Path.home()/'.ssh/codex_wa_server_ed25519'), 'jeblast@103.196.146.186', 'python3', '-'], input=remote, text=True, capture_output=True, check=True)
baseline, manifest, diff = {}, {}, []
with zipfile.ZipFile(root/'toggle-restore-20261019.zip', 'w', zipfile.ZIP_DEFLATED) as archive:
    for name, encoded in json.loads(result.stdout).items():
        before = base64.b64decode(encoded) if encoded is not None else None
        after = (app/name).read_bytes()
        baseline[name] = hashlib.sha256(before).hexdigest() if before is not None else None
        manifest[name] = hashlib.sha256(after).hexdigest()
        archive.writestr(name, after)
        diff.extend(difflib.unified_diff((before or b'').decode('utf-8-sig').splitlines(True), after.decode('utf-8-sig').splitlines(True), fromfile='live/'+name, tofile='new/'+name))
        if before is not None:
            target = app/'tmp/toggle-restore-live-before'/name
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(before)
    archive.writestr('baseline.json', json.dumps(baseline))
    archive.writestr('manifest.json', json.dumps(manifest))
(root/'toggle-restore-live-diff-20261019.txt').write_text(''.join(diff), encoding='utf-8')

print("PREPARED_TOGGLE_RESTORE", len(manifest), "files")

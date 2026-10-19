"""Package only the reviewed device-page presentation changes."""
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
names = ['src/pages/dashboard/phone.tsx', 'src/styles/SummaryCards.module.css', 'src/styles/globals.css']
remote = "from pathlib import Path\nimport base64,json\na=Path('/home/jeblast/repos/doran-whatsapp-server')\nnames=" + repr(names) + "\nprint(json.dumps({n:base64.b64encode((a/n).read_bytes()).decode() for n in names}))"
result = subprocess.run(['ssh', '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=15', '-i', str(Path.home()/'.ssh/codex_wa_server_ed25519'), 'jeblast@103.196.146.186', 'python3', '-'], input=remote, text=True, capture_output=True, check=True)
live = json.loads(result.stdout)
baseline, manifest, diff = {}, {}, []
with zipfile.ZipFile(root/'phone-ui-20261018.zip', 'w', zipfile.ZIP_DEFLATED) as archive:
    for name in names:
        before = base64.b64decode(live[name])
        after = (app/name).read_bytes()
        baseline[name] = hashlib.sha256(before).hexdigest()
        manifest[name] = hashlib.sha256(after).hexdigest()
        archive.writestr(name, after)
        diff.extend(difflib.unified_diff(before.decode('utf-8-sig').splitlines(True), after.decode('utf-8-sig').splitlines(True), fromfile='live/'+name, tofile='new/'+name))
    archive.writestr('baseline.json', json.dumps(baseline))
    archive.writestr('manifest.json', json.dumps(manifest))
(root/'phone-ui-live-diff-20261018.txt').write_text(''.join(diff), encoding='utf-8')
for source, target in [('deploy-theme-colors-20261017.py', 'deploy-phone-ui-20261018.py'), ('run-theme-colors-deploy-20261017.py', 'run-phone-ui-deploy-20261018.py')]:
    script = (root/source).read_text().replace('theme-colors-20261017', 'phone-ui-20261018').replace('theme-colors', 'phone-ui').replace('THEME_COLORS', 'PHONE_UI')
    script = script.replace('phone-ui-deploy-20261017.log', 'phone-ui-deploy-20261018.log')
    # Preserve older backups; this deploy only creates a new recovery snapshot.
    if target.startswith('deploy-'):
        script = script.replace('prune_deploy_backups(backup.parent, backup)', "print('PREVIOUS_BACKUPS_PRESERVED', flush=True)")
    (root/target).write_text(script, encoding='utf-8')
print('PREPARED_PHONE_UI', len(manifest), 'files')

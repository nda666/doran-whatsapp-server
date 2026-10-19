from pathlib import Path
import base64
import difflib
import hashlib
import json
import subprocess
import zipfile

root = Path(__file__).resolve().parent
app = root.parent
names = ['src/lib/dashboardColors.ts', 'src/lib/DashboardPreferences.tsx', 'src/lib/dashboardTheme.ts', 'src/pages/_app.tsx', 'src/components/Layout.tsx', 'src/styles/globals.css']
remote = """from pathlib import Path
import base64, json
app = Path('/home/jeblast/repos/doran-whatsapp-server')
names = %r
print(json.dumps({name:base64.b64encode((app/name).read_bytes()).decode() if (app/name).exists() else None for name in names}))
""" % names
result = subprocess.run(['ssh', '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=15', '-i', str(Path.home()/'.ssh/codex_wa_server_ed25519'), 'jeblast@103.196.146.186', 'python3', '-'], input=remote, text=True, capture_output=True, check=True)
live = json.loads(result.stdout)
baseline, manifest, diff = {}, {}, []
with zipfile.ZipFile(root/'fresh-theme-20261017.zip', 'w', zipfile.ZIP_DEFLATED) as archive:
    for name in names:
        before = base64.b64decode(live[name]) if live[name] is not None else None
        after = (app/name).read_bytes()
        baseline[name] = hashlib.sha256(before).hexdigest() if before is not None else None
        manifest[name] = hashlib.sha256(after).hexdigest()
        archive.writestr(name, after)
        diff.extend(difflib.unified_diff((before or b'').decode('utf-8-sig').splitlines(True), after.decode('utf-8-sig').splitlines(True), fromfile='live/'+name, tofile='new/'+name))
    archive.writestr('baseline.json', json.dumps(baseline))
    archive.writestr('manifest.json', json.dumps(manifest))
(root/'fresh-theme-live-diff-20261017.txt').write_text(''.join(diff), encoding='utf-8')
for source, target in [('deploy-sort-refine-20261017.py', 'deploy-fresh-theme-20261017.py'), ('run-sort-refine-deploy-20261017.py', 'run-fresh-theme-deploy-20261017.py')]:
    text = (root/source).read_text().replace('sort-refine', 'fresh-theme').replace('SORT_REFINE', 'FRESH_THEME')
    if target.startswith('deploy-'):
        text = text.replace("    stage_cleanup.preserve = False\n    print('ROLLED_BACK'", "    assert ready(), 'Rollback startup failed'\n    stage_cleanup.preserve = False\n    print('ROLLED_BACK'")
    (root/target).write_text(text, encoding='utf-8')
print('PREPARED_FRESH_THEME', len(manifest), 'files')

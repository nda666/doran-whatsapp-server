from pathlib import Path
import base64, hashlib, json, subprocess, zipfile, difflib
root = Path.cwd()
names = ['src/pages/dashboard/index.tsx', 'src/styles/DashboardSummary.module.css']
ssh = ['ssh', '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=15', '-i', str(Path.home()/'.ssh/codex_wa_server_ed25519'), 'jeblast@103.196.146.186']
remote = "from pathlib import Path\nimport base64,json\napp=Path('/home/jeblast/repos/doran-whatsapp-server')\nnames=" + repr(names) + "\nprint(json.dumps({n:base64.b64encode((app/n).read_bytes()).decode() if (app/n).is_file() else None for n in names}))"
result = subprocess.run(ssh + ['python3', '-'], input=remote.encode(), capture_output=True, check=True)
snapshot = json.loads(result.stdout)
baseline, manifest = {}, {}
for name, encoded in snapshot.items():
    previous = base64.b64decode(encoded) if encoded is not None else None
    baseline[name] = hashlib.sha256(previous).hexdigest() if previous is not None else None
    if previous is not None:
        target = root/'tmp/dashboard-detail-buttons-live-before'/name
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(previous)
        if name not in ['src/pages/dashboard/index.tsx', 'src/styles/DashboardSummary.module.css', 'src/components/MessagingAnalytics.tsx']:
            diff = ''.join(difflib.unified_diff(previous.decode('utf-8-sig').splitlines(True), (root/name).read_text(encoding='utf-8-sig').splitlines(True), fromfile='live/'+name, tofile='local/'+name))
            (root/'tmp'/('redesign-'+Path(name).name+'.diff')).write_text(diff, encoding='utf-8')
(root/'tmp/dashboard-detail-buttons-baseline.json').write_text(json.dumps(baseline))
print('BASELINE_SAVED', len(baseline), 'files')

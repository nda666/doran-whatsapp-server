"""Snapshot live baselines and package the phone report only."""
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
names = ['src/components/PhoneReport.tsx', 'src/lib/phoneReport.ts', 'src/server/phoneReport.ts', 'src/pages/api/reports.ts', 'src/pages/dashboard/reports.tsx', 'src/components/phone/PhoneTableButton.tsx', 'deployment/verify-phone-report.cjs', 'deployment/verify-phone-report-live.cjs']
remote = "from pathlib import Path\nimport base64,json\na=Path('/home/jeblast/repos/doran-whatsapp-server')\nnames=" + repr(names) + "\nprint(json.dumps({n:base64.b64encode((a/n).read_bytes()).decode() if (a/n).is_file() else None for n in names}))"
result = subprocess.run(['ssh', '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=15', '-i', str(Path.home()/'.ssh/codex_wa_server_ed25519'), 'jeblast@103.196.146.186', 'python3', '-'], input=remote, text=True, capture_output=True, check=True)
baseline, manifest, diff = {}, {}, []
with zipfile.ZipFile(root/'phone-report-20261019.zip', 'w', zipfile.ZIP_DEFLATED) as archive:
    for name, encoded in json.loads(result.stdout).items():
        before = base64.b64decode(encoded) if encoded is not None else None
        after = (app/name).read_bytes()
        baseline[name] = hashlib.sha256(before).hexdigest() if before is not None else None
        manifest[name] = hashlib.sha256(after).hexdigest()
        archive.writestr(name, after)
        diff.extend(difflib.unified_diff((before or b'').decode('utf-8-sig').splitlines(True), after.decode('utf-8-sig').splitlines(True), fromfile='live/'+name, tofile='new/'+name))
        if before is not None:
            target = app/'tmp/phone-report-live-before'/name
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(before)
    archive.writestr('baseline.json', json.dumps(baseline))
    archive.writestr('manifest.json', json.dumps(manifest))
(root/'phone-report-live-diff-20261019.txt').write_text(''.join(diff), encoding='utf-8')
script = (root/'deploy-theme-audit-20261018.py').read_text().replace('theme-audit-20261018', 'phone-report-20261019').replace('theme-audit', 'phone-report').replace('THEME_AUDIT', 'PHONE_REPORT')
script = script.replace("[['npm','run','build']]", "[['node','deployment/verify-phone-report.cjs'],['npm','run','build']]")
probe = '''
with (backup / 'staging-http.log').open('w') as http_log:
    probe = subprocess.Popen(['node','node_modules/next/dist/bin/next','start','-H','127.0.0.1','-p','3001'], cwd=stage, env=env, stdout=http_log, stderr=subprocess.STDOUT)
    try:
        started = False
        for _ in range(45):
            if probe.poll() is not None: break
            try:
                if urllib.request.urlopen('http://127.0.0.1:3001/signin', timeout=2).status == 200:
                    started = True
                    break
            except Exception: pass
            time.sleep(1)
        assert started, 'Isolated report API server failed to start'
        subprocess.run(['node','deployment/verify-phone-report-live.cjs'], cwd=stage, env=dict(env, REPORT_TEST_BASE='http://127.0.0.1:3001'), check=True)
    finally:
        probe.terminate()
        try: probe.wait(timeout=15)
        except subprocess.TimeoutExpired:
            probe.kill()
            probe.wait()
print('ISOLATED_AUTHENTICATED_REPORT_CHECKS_PASSED', flush=True)
'''
script = script.replace("assert (app / '.next/BUILD_ID').read_text() == build_before", probe + "\nassert (app / '.next/BUILD_ID').read_text() == build_before", 1)
(root/'deploy-phone-report-20261019.py').write_text(script, encoding='utf-8')
runner = (root/'run-theme-audit-deploy-20261018.py').read_text().replace('theme-audit-20261018', 'phone-report-20261019').replace('theme-audit', 'phone-report').replace('20261018.log', '20261019.log')
(root/'run-phone-report-deploy-20261019.py').write_text(runner, encoding='utf-8')
print('PREPARED_PHONE_REPORT', len(manifest), 'files; review deployment/phone-report-live-diff-20261019.txt')

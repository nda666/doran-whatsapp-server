from pathlib import Path
import base64, hashlib, json, subprocess, zipfile

root = Path(__file__).resolve().parent.parent
names = ['src/pages/dashboard/dispatch.tsx', 'src/pages/api/dispatch.ts', 'src/lib/dispatchDateFilter.ts', 'deployment/verify-dispatch-display-age.cjs', 'deployment/verify-dispatch-dates-live.cjs']
remote = "from pathlib import Path\nimport base64,json\na=Path('/home/jeblast/repos/doran-whatsapp-server')\nnames=" + repr(names) + "\nprint(json.dumps({n:base64.b64encode((a/n).read_bytes()).decode() if (a/n).exists() else None for n in names}))"
result = subprocess.run(['ssh', '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=15', '-i', str(Path.home()/'.ssh/codex_wa_server_ed25519'), 'jeblast@103.196.146.186', 'python3', '-'], input=remote.encode(), capture_output=True, check=True)
snapshot = json.loads(result.stdout)
baseline, manifest = {}, {}
before = root/'tmp/dispatch-dates-live-before'
with zipfile.ZipFile(root/'deployment/dispatch-dates-20261014.zip', 'w', zipfile.ZIP_DEFLATED) as archive:
    for name, encoded in snapshot.items():
        previous = base64.b64decode(encoded) if encoded else None
        baseline[name] = hashlib.sha256(previous).hexdigest() if previous is not None else None
        if previous is not None:
            target = before/name
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(previous)
        data = (root/name).read_bytes()
        manifest[name] = hashlib.sha256(data).hexdigest()
        archive.writestr(name,data)
    archive.writestr('baseline.json',json.dumps(baseline))
    archive.writestr('manifest.json',json.dumps(manifest))
deploy = (root/'deployment/deploy-dispatch-total-20261013.py').read_text().replace('dispatch-total', 'dispatch-dates').replace('20261013', '20261014').replace('DEPLOYED_DISPATCH_TOTAL', 'DEPLOYED_DISPATCH_DATES')
deploy = deploy.replace("[['npm','run','build']]", "[['node','deployment/verify-dispatch-display-age.cjs'],['npm','run','build']]")
deploy = deploy.replace("'deployment/verify-summary-cards-live.cjs'", "'deployment/verify-dispatch-dates-live.cjs'")
(root/'deployment/deploy-dispatch-dates-20261014.py').write_text(deploy)
print('DISPATCH_DATES_PACKAGE_READY')

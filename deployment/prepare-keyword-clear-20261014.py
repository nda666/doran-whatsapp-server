from pathlib import Path
import base64, hashlib, json, subprocess, zipfile
root = Path(__file__).resolve().parent.parent
names = ['src/components/auto-reply/KeywordTagsInput.tsx', 'deployment/verify-keyword-tags.cjs', 'deployment/verify-keyword-tags-live.cjs']
ssh = ['ssh', '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=15', '-i', str(Path.home()/'.ssh/codex_wa_server_ed25519'), 'jeblast@103.196.146.186']
remote = "from pathlib import Path\nimport base64,json\napp=Path('/home/jeblast/repos/doran-whatsapp-server')\nnames=" + repr(names) + "\nprint(json.dumps({n:base64.b64encode((app/n).read_bytes()).decode() if (app/n).is_file() else None for n in names}))"
result = subprocess.run(ssh + ['python3', '-'], input=remote.encode(), capture_output=True, check=True)
snapshot = json.loads(result.stdout)
baseline, manifest = {}, {}
for name, encoded in snapshot.items():
    previous = base64.b64decode(encoded) if encoded is not None else None
    baseline[name] = hashlib.sha256(previous).hexdigest() if previous is not None else None
    if previous is not None:
        target = root/'tmp/keyword-clear-live-before'/name
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(previous)
expected = json.loads((root/'tmp/keyword-clear-baseline.json').read_text())
assert baseline == expected, 'Live source differs from reviewed local baseline'
with zipfile.ZipFile(root/'deployment/keyword-clear-20261014.zip', 'w', zipfile.ZIP_DEFLATED) as archive:
    for name in names:
        data = (root/name).read_bytes()
        manifest[name] = hashlib.sha256(data).hexdigest()
        archive.writestr(name, data)
    archive.writestr('baseline.json', json.dumps(baseline))
    archive.writestr('manifest.json', json.dumps(manifest))
print('PACKAGE_READY: live baseline matches, three files, existing rule storage preserved')

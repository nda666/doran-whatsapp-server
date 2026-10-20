from pathlib import Path
import base64, difflib, hashlib, json, subprocess, zipfile

app = Path(__file__).resolve().parent.parent
changed = ['src/pages/dashboard/phone.tsx']
files = changed
remote = "from pathlib import Path; import base64,json; root=Path('/home/jeblast/repos/doran-whatsapp-server'); names=" + repr(files) + "; print(json.dumps({name:base64.b64encode((root/name).read_bytes()).decode() if (root/name).is_file() else None for name in names}))"
response = subprocess.check_output(['ssh', '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=15', '-i', str(Path.home()/'.ssh/codex_wa_server_ed25519'), 'jeblast@103.196.146.186', 'python3', '-c', '"' + remote + '"'])
live = json.loads(response)
baseline, manifest, diff = {}, {}, []
def digest(data): return hashlib.sha256(data).hexdigest()
def normalized(data): return data.replace(b'\r\n', b'\n')
with zipfile.ZipFile(app/'deployment/phone-table-order-20261020.zip', 'w', zipfile.ZIP_DEFLATED) as archive:
    for name in files:
        before = base64.b64decode(live[name]) if live[name] is not None else None
        if name in changed and name.startswith(('src/', 'public/', 'prisma/')):
            original = subprocess.check_output(['git', 'show', 'HEAD:'+name], cwd=app)
            assert before is not None and normalized(before) == normalized(original), 'Live baseline differs from local HEAD: '+name
        after = normalized((app/name).read_bytes())
        baseline[name] = digest(before) if before is not None else None
        manifest[name] = digest(after)
        if before is not None:
            snapshot = app/'tmp/phone-table-order-live-before'/name
            snapshot.parent.mkdir(parents=True, exist_ok=True)
            snapshot.write_bytes(before)
        diff.extend(difflib.unified_diff((before or b'').decode().splitlines(True), after.decode().splitlines(True), fromfile='live/'+name, tofile='new/'+name))
        archive.writestr(name, after)
    archive.writestr('baseline.json', json.dumps(baseline))
    archive.writestr('manifest.json', json.dumps(manifest))
(app/'deployment/phone-table-order-live-diff-20261020.txt').write_text(''.join(diff), encoding='utf-8')
print('PREPARED_PHONE_TABLE_ORDER', len(manifest), 'files; all live source baselines match HEAD')

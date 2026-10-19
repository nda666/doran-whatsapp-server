from pathlib import Path
import base64
import difflib
import hashlib
import json
import subprocess
import zipfile

root = Path(__file__).resolve().parent.parent
names = list(json.loads((root / 'deployment/templates-ai-manifest-20261016.json').read_text(encoding='utf-8-sig')))
names += ['deployment/verify-templates-ai-live.cjs']
ssh = ['ssh', '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=15', '-i', str(Path.home()/'.ssh/codex_wa_server_ed25519'), 'jeblast@103.196.146.186']
remote = '''from pathlib import Path
import base64,json,shutil,subprocess,re
a=Path('/home/jeblast/repos/doran-whatsapp-server')
names=NAMES
procs=json.loads(subprocess.check_output(['/usr/local/bin/pm2','jlist']))
print(json.dumps({'metadata':{'build':(a/'.next/BUILD_ID').read_text().strip(),'disk_free_gb':round(shutil.disk_usage(a).free/1024**3,2),'processes':[{'name':p['name'],'pid':p['pid'],'status':p['pm2_env']['status']} for p in procs],'migrations':[p.name for p in (a/'prisma/migrations').iterdir() if p.name.startswith('20261016')],'ai_key_present':bool(re.search(r'^AI_SECRET_KEY=.+', (a/'.env').read_text(), re.M))},'files':{n:base64.b64encode((a/n).read_bytes()).decode() if (a/n).is_file() else None for n in names}}))
'''.replace('NAMES', repr(names))
result = subprocess.run(ssh + ['python3', '-'], input=remote.encode(), capture_output=True, check=True)
payload = json.loads(result.stdout)
print(json.dumps(payload['metadata'], indent=2))
baseline, manifest, diffs = {}, {}, []
for name, encoded in payload['files'].items():
    old = base64.b64decode(encoded) if encoded is not None else None
    data = (root/name).read_bytes()
    baseline[name] = hashlib.sha256(old).hexdigest() if old is not None else None
    manifest[name] = hashlib.sha256(data).hexdigest()
    if old is not None:
        target = root/'tmp/templates-ai-live-before'/name
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(old)
        diff = ''.join(difflib.unified_diff(old.decode().splitlines(True), data.decode().splitlines(True), fromfile='live/'+name, tofile='local/'+name))
        diffs.append(diff)
        print('UPDATED' if diff else 'UNCHANGED', name)
    else: print('NEW', name)
(root/'deployment/templates-ai-live-diff-20261016.txt').write_text('\n'.join(diffs), encoding='utf8')
with zipfile.ZipFile(root/'deployment/templates-ai-deploy-20261016.zip', 'w', zipfile.ZIP_DEFLATED) as archive:
    for name in names: archive.writestr(name, (root/name).read_bytes())
    archive.writestr('baseline.json', json.dumps(baseline))
    archive.writestr('manifest.json', json.dumps(manifest))
(root/'deployment/templates-ai-live-baseline-20261016.json').write_text(json.dumps(payload['metadata'], indent=2))
print('DEPLOY_PACKAGE_READY', len(names), 'files')

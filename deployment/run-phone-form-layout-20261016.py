from pathlib import Path
import subprocess, json, hashlib, base64, io, zipfile

root = Path(__file__).resolve().parent.parent
ssh = ['ssh', '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=15', '-i', str(Path.home()/'.ssh/codex_wa_server_ed25519'), 'jeblast@103.196.146.186']
files = ['src/components/GlobalSettings.tsx', 'src/styles/GlobalSettings.module.css']
remote = '''
from pathlib import Path
import hashlib,json
app=Path('/home/jeblast/repos/doran-whatsapp-server')
names=FILES
print(json.dumps({n:hashlib.sha256((app/n).read_bytes()).hexdigest() if (app/n).exists() else None for n in names}))
'''.replace('FILES', repr(files))
baseline=json.loads(subprocess.check_output(ssh+['python3 -'],input=remote.encode()))
payload={name:(root/name).read_bytes() for name in files}
archive=io.BytesIO()
with zipfile.ZipFile(archive,'w',zipfile.ZIP_DEFLATED) as z:
    for name,data in payload.items(): z.writestr(name,data)
    z.writestr('manifest.json',json.dumps({n:hashlib.sha256(d).hexdigest() for n,d in payload.items()}))
    z.writestr('baseline.json',json.dumps(baseline))
deploy=(root/'deployment/deploy-phone-form-layout-20261016.py').read_bytes()
remote='''
from pathlib import Path
import base64,subprocess,time,os
app=Path('/home/jeblast/repos/doran-whatsapp-server')
home=Path('/home/jeblast')
(home/'phone-form-layout-20261016.zip').write_bytes(base64.b64decode(ZIP))
(home/'deploy-phone-form-layout-20261016.py').write_bytes(base64.b64decode(DEPLOY))
env=dict(os.environ,PATH='/home/jeblast/.local/share/doran-node/node-v24.21.0-linux-x64/bin:'+os.environ['PATH'])
log=(home/'phone-form-layout-deploy-20261016.log').open('w')
p=subprocess.Popen(['python3',str(home/'deploy-phone-form-layout-20261016.py')],cwd=app/'deployment',env=env,stdout=log,stderr=subprocess.STDOUT,start_new_session=True)
print('DEPLOY_STARTED',p.pid,flush=True)
'''.replace('ZIP',repr(base64.b64encode(archive.getvalue()).decode())).replace('DEPLOY)',repr(base64.b64encode(deploy).decode())+')')
subprocess.run(ssh+['python3 -'],input=remote.encode(),check=True)

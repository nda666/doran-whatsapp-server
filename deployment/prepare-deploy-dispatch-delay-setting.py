from pathlib import Path
import json, hashlib, subprocess, zipfile
root=Path(__file__).resolve().parent.parent
baseline=json.loads((root/'tmp/delay-setting-baseline.json').read_text())
new=['deployment/verify-dispatch-delay-setting.cjs','deployment/verify-dispatch-delay-setting-live.cjs']
names=list(baseline)+new
ssh=['ssh','-o','BatchMode=yes','-o','ConnectTimeout=15','-i',str(Path.home()/'.ssh/codex_wa_server_ed25519'),'jeblast@103.196.146.186']
remote="from pathlib import Path\nimport json,hashlib\na=Path('/home/jeblast/repos/doran-whatsapp-server')\nnames="+repr(names)+"\nprint(json.dumps({n:hashlib.sha256((a/n).read_bytes()).hexdigest() if (a/n).is_file() else None for n in names}))"
r=subprocess.run(ssh+['python3','-'],input=remote,text=True,capture_output=True,check=True)
actual=json.loads(r.stdout)
for n,digest in baseline.items(): assert actual[n]==digest,'Live source differs from original local baseline: '+n
for n in new: assert actual[n] is None,'New file already exists: '+n
manifest={n:hashlib.sha256((root/n).read_bytes()).hexdigest() for n in names}
archive=root/'deployment/dispatch-delay-setting-20261014.zip'
with zipfile.ZipFile(archive,'w',zipfile.ZIP_DEFLATED) as z:
    for n in names:z.writestr(n,(root/n).read_bytes())
    z.writestr('baseline.json',json.dumps(actual));z.writestr('manifest.json',json.dumps(manifest))
print('PACKAGE_BASELINE_VERIFIED '+str(len(names))+' files',flush=True)
subprocess.run(['scp','-o','BatchMode=yes','-o','ConnectTimeout=15','-i',str(Path.home()/'.ssh/codex_wa_server_ed25519'),str(archive),'jeblast@103.196.146.186:/home/jeblast/dispatch-delay-setting-20261014.zip'],check=True)
script=(root/'deployment/deploy-dispatch-delay-setting-20261014.py').read_text()
result=subprocess.run(ssh+['python3','-u','-'],input=script,text=True)
raise SystemExit(result.returncode)

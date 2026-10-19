from pathlib import Path
import base64, difflib, hashlib, json, subprocess, zipfile
root = Path(__file__).resolve().parent.parent
names = ['src/server/dispatch/settings.ts', 'src/pages/api/dispatch.ts', 'src/pages/dashboard/dispatch.tsx', 'src/components/GlobalSettings.tsx', 'deployment/verify-dispatch-display-age.cjs', 'deployment/verify-dispatch-display-age-live.cjs']
remote = "from pathlib import Path\nimport base64,json\napp=Path('/home/jeblast/repos/doran-whatsapp-server')\nnames=" + repr(names) + "\nprint(json.dumps({n:base64.b64encode((app/n).read_bytes()).decode() if (app/n).is_file() else None for n in names}))"
result = subprocess.run(['ssh','-o','BatchMode=yes','-o','ConnectTimeout=15','-i',str(Path.home()/'.ssh/codex_wa_server_ed25519'),'jeblast@103.196.146.186','python3','-'], input=remote.encode(), capture_output=True, check=True)
snapshot = json.loads(result.stdout)
baseline, manifest = {}, {}
with zipfile.ZipFile(root/'deployment/dispatch-display-age-20261013.zip','w',zipfile.ZIP_DEFLATED) as archive:
 for name, encoded in snapshot.items():
  previous = base64.b64decode(encoded) if encoded is not None else None
  baseline[name] = hashlib.sha256(previous).hexdigest() if previous is not None else None
  data = (root/name).read_bytes()
  manifest[name] = hashlib.sha256(data).hexdigest(); archive.writestr(name,data)
  if previous is not None:
   target = root/'tmp/dispatch-display-age-live-before'/name; target.parent.mkdir(parents=True,exist_ok=True); target.write_bytes(previous)
   diff = list(difflib.unified_diff(previous.decode().splitlines(),data.decode().splitlines(),fromfile='live/'+name,tofile='local/'+name))
   print('\n'.join(diff))
  else: print('NEW',name)
 archive.writestr('baseline.json',json.dumps(baseline)); archive.writestr('manifest.json',json.dumps(manifest))
print('PACKAGE_READY',len(manifest),'files; no credentials included')

from pathlib import Path
import base64, json, subprocess
root = Path(__file__).resolve().parent.parent
names = ['src/pages/dashboard/phone.tsx', 'src/pages/dashboard/dispatch.tsx', 'src/pages/api/phones/index.ts']
remote = "from pathlib import Path\nimport base64,json\na=Path('/home/jeblast/repos/doran-whatsapp-server')\nnames=" + repr(names) + "\nprint(json.dumps({n:base64.b64encode((a/n).read_bytes()).decode() for n in names}))"
r = subprocess.run(['ssh','-o','BatchMode=yes','-o','ConnectTimeout=15','-i',str(Path.home()/'.ssh/codex_wa_server_ed25519'),'jeblast@103.196.146.186','python3','-'],input=remote.encode(),capture_output=True,check=True)
snapshot = json.loads(r.stdout)
for name, encoded in snapshot.items():
 data = base64.b64decode(encoded)
 target = root/'tmp/summary-cards-live-before'/name
 target.parent.mkdir(parents=True,exist_ok=True); target.write_bytes(data)
 (root/name).write_bytes(data)
print('LIVE_SOURCE_SYNCED',len(snapshot))

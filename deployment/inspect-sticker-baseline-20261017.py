from pathlib import Path
import subprocess,json,base64,difflib
names=['package.json','package-lock.json','src/pages/dashboard/campaigns.tsx','src/server/campaigns/prepare.ts','src/pages/api/campaigns/index.ts','src/pages/api/campaigns/[id].ts','src/pages/api/media/index.ts','src/pages/dashboard/media.tsx','src/components/phone/TestSendModal.tsx','src/lib/testSend.ts']
remote="from pathlib import Path\nimport json,base64\na=Path('/home/jeblast/repos/doran-whatsapp-server')\nnames="+repr(names)+"\nprint(json.dumps({n:base64.b64encode((a/n).read_bytes()).decode() if (a/n).exists() else None for n in names}))"
r=subprocess.run(['ssh','-o','BatchMode=yes','-o','ConnectTimeout=15','-i',str(Path.home()/'.ssh/codex_wa_server_ed25519'),'jeblast@103.196.146.186','python3','-'],input=remote.encode(),capture_output=True,check=True)
root=Path(__file__).resolve().parent.parent
p=root/'tmp/sticker-live-before';p.mkdir(parents=True,exist_ok=True)
for name,encoded in json.loads(r.stdout).items():
 old=base64.b64decode(encoded) if encoded else b''
 target=p/name;target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(old)
 before=old.decode().replace('\r\r\n','\n').replace('\r\n','\n');after=(root/name).read_text()
 diff=list(difflib.unified_diff(before.splitlines(),after.splitlines(),fromfile='live/'+name,tofile='local/'+name))
 print('\n'.join(diff) if len(diff)<190 else name+': '+str(len(diff))+' diff lines')

from pathlib import Path
import subprocess, json, base64, hashlib, zipfile
root=Path(__file__).resolve().parent.parent
names=['package.json','package-lock.json','src/pages/dashboard/campaigns.tsx','src/server/campaigns/prepare.ts','src/pages/api/campaigns/index.ts','src/pages/api/campaigns/[id].ts','src/pages/api/media/index.ts','src/pages/dashboard/media.tsx','src/components/phone/TestSendModal.tsx','src/lib/testSend.ts','src/server/campaigns/sticker.ts','src/components/StickerPhotoUpload.tsx','src/components/StickerPreview.tsx','deployment/verify-sticker-conversion.cjs','deployment/verify-sticker-upload.cjs','deployment/verify-sticker-live.cjs','deployment/verify-campaign-personalization.cjs']
remote="from pathlib import Path\nimport json,base64\na=Path('/home/jeblast/repos/doran-whatsapp-server')\nnames="+repr(names)+"\nprint(json.dumps({n:base64.b64encode((a/n).read_bytes()).decode() if (a/n).is_file() else None for n in names}))"
r=subprocess.run(['ssh','-o','BatchMode=yes','-o','ConnectTimeout=15','-i',str(Path.home()/'.ssh/codex_wa_server_ed25519'),'jeblast@103.196.146.186','python3','-'],input=remote.encode(),capture_output=True,check=True)
manifest={};baseline={}
with zipfile.ZipFile(root/'deployment/sticker-20261017.zip','w',zipfile.ZIP_DEFLATED) as archive:
 for n,encoded in json.loads(r.stdout).items():
  old=base64.b64decode(encoded) if encoded is not None else None
  saved=root/'tmp/sticker-live-before'/n
  if saved.exists(): assert old==saved.read_bytes(), 'Concurrent source change: '+n
  baseline[n]=hashlib.sha256(old).hexdigest() if old is not None else None
  data=(root/n).read_bytes();manifest[n]=hashlib.sha256(data).hexdigest();archive.writestr(n,data)
 archive.writestr('manifest.json',json.dumps(manifest));archive.writestr('baseline.json',json.dumps(baseline))
print('STICKER_PACKAGE_READY',len(manifest),'files')

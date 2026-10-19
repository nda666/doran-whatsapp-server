from pathlib import Path
import hashlib,json,subprocess,zipfile
root=Path(__file__).resolve().parent.parent
names=['src/server/index.ts','src/server/events/connectionUpdate.ts','src/server/libs/makeWASocket.ts','src/server/libs/waRecoveryState.ts','src/server/waRecovery.ts','deployment/verify-wa-recovery.cjs','deployment/verify-connection-status.cjs', 'src/lib/phoneConnectionStatus.ts', 'src/server/phoneConnectionInfo.ts', 'src/components/phone/PhoneConnectionStatus.tsx', 'src/components/phone/PhoneTableButton.tsx', 'src/pages/api/phones/index.ts', 'src/lib/usePhoneData.ts', 'src/pages/dashboard/phone.tsx', 'deployment/verify-phone-connection-info.cjs', 'src/components/phone/ModalQrCode.tsx']
remote="from pathlib import Path\nimport hashlib,json\napp=Path('/home/jeblast/repos/doran-whatsapp-server')\nnames="+repr(names)+"\nprint(json.dumps({n:hashlib.sha256((app/n).read_bytes()).hexdigest() if (app/n).is_file() else None for n in names}))"
result=subprocess.run(['ssh','-o','BatchMode=yes','-o','ConnectTimeout=15','-i',str(Path.home()/'.ssh/codex_wa_server_ed25519'),'jeblast@103.196.146.186','python3','-'],input=remote.encode(),capture_output=True,check=True)
baseline=json.loads(result.stdout);manifest={}
with zipfile.ZipFile(root/'deployment/wa-recovery-20261015.zip','w',zipfile.ZIP_DEFLATED) as archive:
 for name in names:
  data=(root/name).read_bytes();manifest[name]=hashlib.sha256(data).hexdigest();archive.writestr(name,data)
 archive.writestr('baseline.json',json.dumps(baseline));archive.writestr('manifest.json',json.dumps(manifest))
print('WA_RECOVERY_PACKAGE_READY',len(manifest),'files; no credentials included')


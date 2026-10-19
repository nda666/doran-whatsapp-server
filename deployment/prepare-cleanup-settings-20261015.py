from pathlib import Path
import hashlib,json,subprocess,zipfile
root=Path(__file__).resolve().parent.parent
names=['src/lib/phoneCleanup.ts', 'src/components/phone/PhoneCleanupModal.tsx', 'deployment/verify-phone-cleanup.cjs', 'deployment/stage_cleanup.py', 'deployment/verify-stage-cleanup.py', 'deployment/deploy-phone-cleanup-20261015.py', 'deployment/deploy-cleanup-settings-20261015.py', 'deployment/cleanup-old-repo-stages.py', 'deployment/README.md']
remote="from pathlib import Path\nimport hashlib,json\napp=Path('/home/jeblast/repos/doran-whatsapp-server')\nnames="+repr(names)+"\nprint(json.dumps({n:hashlib.sha256((app/n).read_bytes()).hexdigest() if (app/n).is_file() else None for n in names}))"
result=subprocess.run(['ssh','-o','BatchMode=yes','-o','ConnectTimeout=15','-i',str(Path.home()/'.ssh/codex_wa_server_ed25519'),'jeblast@103.196.146.186','python3','-'],input=remote.encode(),capture_output=True,check=True)
baseline=json.loads(result.stdout);manifest={}
with zipfile.ZipFile(root/'deployment/cleanup-settings-20261015.zip','w',zipfile.ZIP_DEFLATED) as archive:
 for name in names:
  data=(root/name).read_bytes();manifest[name]=hashlib.sha256(data).hexdigest();archive.writestr(name,data)
 archive.writestr('baseline.json',json.dumps(baseline));archive.writestr('manifest.json',json.dumps(manifest))
print('CLEANUP_SETTINGS_PACKAGE_READY',len(manifest),'files; no credentials included')



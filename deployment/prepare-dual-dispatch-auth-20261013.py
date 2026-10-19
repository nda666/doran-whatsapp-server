from pathlib import Path
import hashlib,json,subprocess,zipfile
root=Path(__file__).resolve().parent.parent
names=['src/server/dispatchAuth.ts', 'src/pages/api/send-message.ts', 'src/pages/api/send-status.ts', 'src/data/apiDocumentation.json', 'src/lib/apiIntegrationSamples.ts', 'src/pages/dashboard/api-docs.tsx', 'public/downloads/jeblast-api.postman_collection.json', 'public/downloads/jeblast-api.postman_environment.json', 'deployment/verify-dual-dispatch-auth.cjs', 'deployment/verify-dual-dispatch-auth-live.cjs', 'deployment/verify-send-response.cjs', 'deployment/verify-dispatch.cjs', 'deployment/dual-dispatch-auth.md']
remote="from pathlib import Path\nimport hashlib,json\napp=Path('/home/jeblast/repos/doran-whatsapp-server')\nnames="+repr(names)+"\nprint(json.dumps({n:hashlib.sha256((app/n).read_bytes()).hexdigest() if (app/n).is_file() else None for n in names}))"
result=subprocess.run(['ssh','-o','BatchMode=yes','-o','ConnectTimeout=15','-i',str(Path.home()/'.ssh/codex_wa_server_ed25519'),'jeblast@103.196.146.186','python3','-'],input=remote.encode(),capture_output=True,check=True)
baseline=json.loads(result.stdout);manifest={}
with zipfile.ZipFile(root/'deployment/dual-dispatch-auth-20261013.zip','w',zipfile.ZIP_DEFLATED) as archive:
 for name in names:
  data=(root/name).read_bytes();manifest[name]=hashlib.sha256(data).hexdigest();archive.writestr(name,data)
 archive.writestr('baseline.json',json.dumps(baseline));archive.writestr('manifest.json',json.dumps(manifest))
print('DUAL_DISPATCH_AUTH_PACKAGE_READY',len(manifest),'files; no credentials included')

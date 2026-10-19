from pathlib import Path
import base64, hashlib, json, subprocess, zipfile
root = Path(__file__).resolve().parent.parent
names = ['src/pages/dashboard/dispatch.tsx', 'deployment/verify-summary-cards-live.cjs']
remote = "from pathlib import Path\nimport base64,json\na=Path('/home/jeblast/repos/doran-whatsapp-server')\nnames=" + repr(names) + "\nprint(json.dumps({n:base64.b64encode((a/n).read_bytes()).decode() for n in names}))"
result = subprocess.run(['ssh','-o','BatchMode=yes','-o','ConnectTimeout=15','-i',str(Path.home()/'.ssh/codex_wa_server_ed25519'),'jeblast@103.196.146.186','python3','-'],input=remote.encode(),capture_output=True,check=True)
snapshot = json.loads(result.stdout)
baseline, manifest = {}, {}
with zipfile.ZipFile(root/'deployment/dispatch-info-position-20261013.zip','w',zipfile.ZIP_DEFLATED) as archive:
 for name, encoded in snapshot.items():
  previous = base64.b64decode(encoded)
  baseline[name] = hashlib.sha256(previous).hexdigest()
  source = previous.decode()
  if name.endswith('.tsx'):
   lines = source.splitlines(keepends=True)
   notice = [line for line in lines if '<Alert type="info" showIcon message="Status setiap penerima"' in line]
   assert len(notice) == 1
   lines.remove(notice[0])
   target = next(i for i,line in enumerate(lines) if '<Card title="Pencarian">' in line)
   lines.insert(target,notice[0])
   source = ''.join(lines)
  else:
   marker = '    assert(html.includes(title));'
   assert marker in source
   source = source.replace(marker,marker + '\n    if (page === "dispatch") assert(html.indexOf("Ringkasan pengiriman") < html.indexOf("Status setiap penerima") && html.indexOf("Status setiap penerima") < html.indexOf(">Pencarian<"), "Dispatch summary, status information, search order");')
  data = source.encode()
  (root/name).write_bytes(data)
  manifest[name] = hashlib.sha256(data).hexdigest(); archive.writestr(name,data)
 archive.writestr('baseline.json',json.dumps(baseline));archive.writestr('manifest.json',json.dumps(manifest))
deploy = (root/'deployment/deploy-summary-cards-20261013.py').read_text().replace('.doran-summary-cards-', '.doran-dispatch-info-position-').replace('doran-summary-cards-', 'doran-dispatch-info-position-').replace('summary-cards-20261013.zip','dispatch-info-position-20261013.zip').replace('DEPLOYED_SUMMARY_CARDS','DEPLOYED_DISPATCH_INFO_POSITION')
(root/'deployment/deploy-dispatch-info-position-20261013.py').write_text(deploy)
print('PACKAGE_READY: move status information directly above search; verify live ordering')


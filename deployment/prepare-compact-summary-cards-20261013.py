from pathlib import Path
import base64, hashlib, json, subprocess, zipfile
root = Path(__file__).resolve().parent.parent
name = 'src/styles/SummaryCards.module.css'
remote = "from pathlib import Path\nimport base64\nprint(base64.b64encode((Path('/home/jeblast/repos/doran-whatsapp-server')/" + repr(name) + ").read_bytes()).decode())"
result = subprocess.run(['ssh','-o','BatchMode=yes','-o','ConnectTimeout=15','-i',str(Path.home()/'.ssh/codex_wa_server_ed25519'),'jeblast@103.196.146.186','python3','-'],input=remote.encode(),capture_output=True,check=True)
previous = base64.b64decode(result.stdout.strip())
source = previous.decode()
changes = {
 'padding: 20px;': 'padding: 14px 18px;',
 'min-height: 44px;': 'min-height: 32px;',
 'width: 40px; height: 40px;': 'width: 32px; height: 32px;',
 'border-radius: 12px; color: var(--summary-color);': 'border-radius: 10px; color: var(--summary-color);',
 'font-size: 21px;': 'font-size: 18px;',
 'margin: 14px 0 8px;': 'margin: 8px 0 3px;',
 '.card { padding: 14px; border-radius: 12px; }': '.card { padding: 10px 12px; border-radius: 12px; }',
 '.value { font-size: 30px; }': '.value { font-size: 30px; margin: 6px 0 2px; }',
}
for old,new in changes.items():
 assert source.count(old) == 1, old
 source = source.replace(old,new)
data = source.encode(); (root/name).write_bytes(data)
with zipfile.ZipFile(root/'deployment/compact-summary-cards-20261013.zip','w',zipfile.ZIP_DEFLATED) as archive:
 archive.writestr(name,data)
 archive.writestr('baseline.json',json.dumps({name:hashlib.sha256(previous).hexdigest()}))
 archive.writestr('manifest.json',json.dumps({name:hashlib.sha256(data).hexdigest()}))
deploy = (root/'deployment/deploy-summary-cards-20261013.py').read_text().replace('doran-summary-cards-', 'doran-compact-summary-cards-').replace('/home/jeblast/summary-cards-20261013.zip','/home/jeblast/compact-summary-cards-20261013.zip').replace('DEPLOYED_SUMMARY_CARDS','DEPLOYED_COMPACT_SUMMARY_CARDS')
(root/'deployment/deploy-compact-summary-cards-20261013.py').write_text(deploy)
print('PACKAGE_READY: compact shared cards; retain 36px desktop and 30px mobile numbers')

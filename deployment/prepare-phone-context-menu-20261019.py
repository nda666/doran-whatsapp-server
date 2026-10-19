from pathlib import Path
import difflib
import hashlib
import json
import subprocess
import zipfile

root = Path(__file__).resolve().parent
app = root.parent
name = 'src/pages/dashboard/phone.tsx'
remote = "from pathlib import Path; import sys; sys.stdout.buffer.write(Path('/home/jeblast/repos/doran-whatsapp-server/src/pages/dashboard/phone.tsx').read_bytes())"
before = subprocess.run(['ssh', '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=15', '-i', str(Path.home()/'.ssh/codex_wa_server_ed25519'), 'jeblast@103.196.146.186', 'python3', '-c', '"' + remote + '"'], capture_output=True, check=True).stdout
text = before.decode('utf-8')
block = '''          onRow={(record) => {
            return {
              onContextMenu: (event) => {
                event.preventDefault();
                //
              },
            };
          }}
'''
if '\r\n' in text:
    block = block.replace('\n', '\r\n')
assert text.count(block) == 1, 'Expected exactly one matching live context-menu blocker'
after = text.replace(block, '').encode('utf-8')
snapshot = app/'tmp/phone-context-menu-live-before'/name
snapshot.parent.mkdir(parents=True, exist_ok=True)
snapshot.write_bytes(before)
with zipfile.ZipFile(root/'phone-context-menu-20261019.zip', 'w', zipfile.ZIP_DEFLATED) as archive:
    archive.writestr(name, after)
    archive.writestr('baseline.json', json.dumps({name: hashlib.sha256(before).hexdigest()}))
    archive.writestr('manifest.json', json.dumps({name: hashlib.sha256(after).hexdigest()}))
diff = ''.join(difflib.unified_diff(text.splitlines(True), after.decode().splitlines(True), fromfile='live/'+name, tofile='new/'+name))
(root/'phone-context-menu-live-diff-20261019.txt').write_text(diff, encoding='utf-8')
script = (root/'deploy-theme-audit-20261018.py').read_text().replace('theme-audit-20261018', 'phone-context-menu-20261019').replace('theme-audit', 'phone-context-menu').replace('THEME_AUDIT', 'PHONE_CONTEXT_MENU')
(root/'deploy-phone-context-menu-20261019.py').write_text(script, encoding='utf-8')
runner = (root/'run-phone-report-deploy-20261019.py').read_text().replace('phone-report', 'phone-context-menu')
(root/'run-phone-context-menu-deploy-20261019.py').write_text(runner, encoding='utf-8')
print(diff)
print('PREPARED_PHONE_CONTEXT_MENU: one live file; removed only the right-click blocker')

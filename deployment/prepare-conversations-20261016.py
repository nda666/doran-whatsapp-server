from pathlib import Path
import sys
sys.stdout.reconfigure(encoding="utf-8")
import base64
import difflib
import hashlib
import json
import subprocess
import zipfile

root = Path(__file__).resolve().parent.parent
names = ['prisma/migrations/20261016100000_chat_capture_since/migration.sql', 'deployment/verify-phone-create-defaults.cjs', 'prisma/schema.prisma', 'prisma/migrations/20261016090000_conversations/migration.sql', 'src/components/phone/PhoneFormModal.tsx', 'src/components/phone/PhoneTableButton.tsx', 'src/components/phone/PhoneCleanupModal.tsx', 'src/components/Layout.tsx', 'src/pages/api/phones/index.ts', 'src/server/deviceWebhook/events.ts', 'src/server/libs/makeWASocket.ts', 'src/server/cleanupPhone.ts', 'src/server/registeredPhones.ts', 'src/lib/phoneCleanup.ts', 'src/pages/dashboard/conversations.tsx', 'src/styles/Conversations.module.css', 'deployment/verify-phone-cleanup.cjs', 'deployment/verify-wa-recovery.cjs', 'deployment/verify-conversations.cjs', 'deployment/verify-conversations-live.cjs', 'src/server/chat/content.ts', 'src/server/chat/media.ts', 'src/server/chat/public.ts', 'src/server/chat/send.ts', 'src/server/chat/store.ts', 'src/pages/api/conversations/index.ts', 'src/pages/api/conversations/[id].ts', 'src/pages/api/conversations/media/[id].ts', 'src/pages/api/conversations/[id]/send.ts']
ssh = ['ssh', '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=15', '-i', str(Path.home()/'.ssh/codex_wa_server_ed25519'), 'jeblast@103.196.146.186']
remote = "from pathlib import Path\nimport base64,json\na=Path('/home/jeblast/repos/doran-whatsapp-server')\nnames=" + repr(names) + "\nprint(json.dumps({n:base64.b64encode((a/n).read_bytes()).decode() if (a/n).is_file() else None for n in names}))"
result = subprocess.run(ssh + ['python3', '-'], input=remote.encode(), capture_output=True, check=True)
baseline, manifest = {}, {}
for name, encoded in json.loads(result.stdout).items():
    old = base64.b64decode(encoded) if encoded is not None else None
    baseline[name] = hashlib.sha256(old).hexdigest() if old is not None else None
    if old is not None:
        target = root/'tmp/conversations-live-before'/name
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(old)
        print(''.join(difflib.unified_diff(old.decode().replace('\r\r\n', '\n').replace('\r\n', '\n').splitlines(True), (root/name).read_text(encoding='utf-8').splitlines(True), fromfile='live/'+name, tofile='local/'+name)))
with zipfile.ZipFile(root/'deployment/conversations-20261016.zip', 'w', zipfile.ZIP_DEFLATED) as archive:
    for name in names:
        data = (root/name).read_bytes()
        manifest[name] = hashlib.sha256(data).hexdigest()
        archive.writestr(name, data)
    archive.writestr('baseline.json', json.dumps(baseline))
    archive.writestr('manifest.json', json.dumps(manifest))
print('PACKAGE_READY', len(names), 'files')

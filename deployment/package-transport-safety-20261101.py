"""Package only the approved transport changes, guarded by current remote source hashes."""
from pathlib import Path
import base64
import difflib
import hashlib
import json
import shlex
import subprocess
import zipfile

ROOT = Path(__file__).resolve().parent.parent
FILES = [
    'src/server/messaging/transportSafety.ts', 'src/server/messaging/sendFence.ts',
    'src/server/dispatch/health.ts', 'src/server/dispatchControlAuth.ts',
    'src/server/libs/makeWASocket.ts', 'src/server/libs/sendMessageFromIo.ts',
    'src/server/libs/sendGroupMessageFromIo.ts', 'src/server/libs/sendAttachmentMessageIo.ts',
    'src/server/events/connectionUpdate.ts', 'src/server/dispatch/worker.ts',
    'src/server/chat/send.ts', 'src/pages/api/public/[action].ts',
    'deployment/verify-transport-safety.cjs', 'deployment/ci-tests.cjs',
    'deployment/verify-transport-mysql.cjs',
    'deployment/verify-connection-status.cjs', 'deployment/verify-pairing-identity.cjs',
    'deployment/verify-wa-recovery.cjs', 'deployment/verify-phone-last-offline.cjs',
    'deployment/verify-phone-last-qr-scan.cjs', 'deployment/verify-device-delay-range.cjs',
    'deployment/transport-safety-20261101.md',
]
HOST = 'jeblast@103.196.146.186'
KEY = str(Path.home() / '.ssh/codex_wa_server_ed25519')
remote = """from pathlib import Path
import json,base64,hashlib
root=Path('/home/jeblast/repos/doran-whatsapp-server')
files=json.loads(base64.b64decode(PAYLOAD))
result={}
for name in files:
    file=root/name
    content=file.read_bytes() if file.is_file() else None
    result[name]={'hash':hashlib.sha256(content).hexdigest() if content is not None else None,'content':base64.b64encode(content).decode() if content is not None else None}
print(json.dumps(result))
""".replace('PAYLOAD', repr(base64.b64encode(json.dumps(FILES).encode()).decode()))
result = subprocess.check_output(['ssh', '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=15', '-i', KEY, HOST,
                                  'python3 -c ' + shlex.quote(remote)])
baseline = json.loads(result)
(ROOT / 'tmp/transport-remote-baseline.json').write_text(json.dumps({name: value['hash'] for name, value in baseline.items()}))
patch = []
manifest = {}
for name in FILES:
    content = (ROOT / name).read_bytes()
    manifest[name] = hashlib.sha256(content).hexdigest()
    before = base64.b64decode(baseline[name]['content']).decode() if baseline[name]['content'] else ''
    patch.extend(difflib.unified_diff(before.replace('\r\n', '\n').splitlines(True), content.decode().replace('\r\n', '\n').splitlines(True), fromfile='remote/' + name, tofile='local/' + name))
(ROOT / 'tmp/transport-versus-production.patch').write_text(''.join(patch), encoding='utf-8')
archive = ROOT / 'tmp/transport-safety-20261101.zip'
with zipfile.ZipFile(archive, 'w', zipfile.ZIP_DEFLATED) as bundle:
    for name in FILES:
        bundle.write(ROOT / name, name)
    bundle.writestr('manifest.json', json.dumps(manifest))
    bundle.writestr('baseline.json', json.dumps({name: value['hash'] for name, value in baseline.items()}))
print(json.dumps({'files': len(FILES), 'bytes': archive.stat().st_size, 'archive': str(archive)}))

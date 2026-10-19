"""Read only the source files involved in localization; never fetch env or user data."""
from pathlib import Path
import base64
import hashlib
import json
import subprocess

root = Path(__file__).resolve().parent.parent
files = json.loads((root / 'tmp/localization/modified.json').read_text())
files += ['src/pages/_app.tsx', 'src/pages/_document.tsx', 'src/lib/uiTranslation.ts', 'src/lib/uiTranslationCore.ts', 'src/lib/dispatchWindow.ts', 'src/lib/superAdminPageProps.ts', 'src/data/uiMessagePatterns.json']
files += ['src/middleware.ts','src/components/AccountSessionGuard.tsx','src/lib/localizedPath.ts']
files += [p.relative_to(root).as_posix() for p in (root / 'public/locales').rglob('*.json')]
files = sorted(set(files))
(root / 'tmp/localization/deploy-files.json').write_text(json.dumps(files, indent=2))
remote = '''from pathlib import Path
import base64, hashlib, json
app=Path('/home/jeblast/repos/doran-whatsapp-server')
files=FILE_LIST
result={}
for name in files:
 p=app/name
 result[name]={'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'content':base64.b64encode(p.read_bytes()).decode()} if p.is_file() else {'sha256':None,'content':None}
print(json.dumps(result))
'''.replace('FILE_LIST', repr(files))
key = str(Path.home() / '.ssh/codex_wa_server_ed25519')
result = subprocess.run(['ssh', '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=15', '-i', key, 'jeblast@103.196.146.186', 'python3', '-'], input=remote, text=True, capture_output=True, check=True)
snapshot = json.loads(result.stdout)
base = root / 'tmp/localization/live-before'
for name, info in snapshot.items():
    if info['content'] is not None:
        target = base / name
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(base64.b64decode(info['content']))
(root / 'tmp/localization/live-baseline.json').write_text(json.dumps({name: info['sha256'] for name, info in snapshot.items()}, indent=2))
differences = []
for name, info in snapshot.items():
    original = root / 'tmp/localization/source-before' / name
    if original.is_file() and hashlib.sha256(original.read_bytes()).hexdigest() != info['sha256']:
        differences.append(name)
print(json.dumps({'files': len(files), 'liveChangedSinceLocalBaseline': differences}, indent=2))

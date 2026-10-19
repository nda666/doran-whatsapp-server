from pathlib import Path
import difflib, hashlib, json, subprocess, sys, zipfile

root = Path(__file__).resolve().parent.parent
names = [
    'src/server/dispatch/retry.ts', 'src/server/dispatch/worker.ts',
    'src/server/dispatch/receipts.ts', 'src/server/dispatch/queue.ts',
    'src/server/dispatchWebhook/events.ts', 'src/lib/dispatchPresentation.ts',
    'src/pages/dashboard/api-docs.tsx', 'src/data/apiDocumentation.json',
    'deployment/build-api-toolkit.py', 'deployment/verify-dispatch-ack-retry.cjs',
    'deployment/verify-dispatch-random-delay.cjs', 'deployment/verify-dispatch-order.cjs',
    'deployment/verify-dispatch-age-setting.cjs',
]
ssh = ['ssh', '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=15', '-i',
       str(Path.home()/'.ssh/codex_wa_server_ed25519'), 'jeblast@103.196.146.186']
snapshot = root/'tmp/ack-retry-live-before.json'
if '--snapshot' in sys.argv:
    remote = "from pathlib import Path\nimport json\na=Path('/home/jeblast/repos/doran-whatsapp-server')\nnames=" + repr(names) + "\nprint(json.dumps({n:(a/n).read_bytes().decode() if (a/n).is_file() else None for n in names}))"
    result = subprocess.run(ssh+['python3', '-'], input=remote, text=True, capture_output=True, check=True)
    live = json.loads(result.stdout)
    snapshot.write_text(json.dumps(live), encoding='utf-8')
    for name, original in live.items():
        if original is None:
            print('NEW', name)
        elif name != 'src/data/apiDocumentation.json':
            diff = list(difflib.unified_diff(original.splitlines(), (root/name).read_text(encoding='utf-8').splitlines(), fromfile='live/'+name, tofile='local/'+name))
            print('\n'.join(diff))
    sys.exit(0)
live = json.loads(snapshot.read_text(encoding='utf-8'))
baseline = {name: hashlib.sha256(content.encode()).hexdigest() if content is not None else None for name, content in live.items()}
manifest = {name: hashlib.sha256((root/name).read_bytes()).hexdigest() for name in names}
archive = root/'deployment/dispatch-ack-retry-20261015.zip'
with zipfile.ZipFile(archive, 'w', zipfile.ZIP_DEFLATED) as z:
    for name in names: z.write(root/name, name)
    z.writestr('baseline.json', json.dumps(baseline))
    z.writestr('manifest.json', json.dumps(manifest))
subprocess.run(['scp', *ssh[1:-1], str(archive), 'jeblast@103.196.146.186:/home/jeblast/dispatch-ack-retry-20261015.zip'], check=True)
script = (root/'deployment/deploy-dispatch-ack-retry-20261015.py').read_text()
result = subprocess.run(ssh+['python3', '-u', '-'], input=script, text=True)
sys.exit(result.returncode)

from pathlib import Path
import difflib, hashlib, json, subprocess, sys, zipfile

root = Path(__file__).resolve().parent.parent
names = ['src/pages/api/dispatch.ts', 'src/pages/dashboard/dispatch.tsx',
         'src/pages/api/dispatch-reset.ts', 'deployment/verify-dispatch-display-age.cjs',
         'deployment/verify-dispatch-reset.cjs', 'deployment/verify-dispatch-filter-reset-live.cjs']
ssh = ['ssh', '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=15', '-i',
       str(Path.home()/'.ssh/codex_wa_server_ed25519'), 'jeblast@103.196.146.186']
snapshot = root/'tmp/dispatch-filter-reset-live-before.json'
if '--snapshot' in sys.argv:
    remote = "from pathlib import Path\nimport json\na=Path('/home/jeblast/repos/doran-whatsapp-server')\nnames=" + repr(names) + "\nprint(json.dumps({n:(a/n).read_bytes().decode() if (a/n).is_file() else None for n in names}))"
    result = subprocess.run(ssh+['python3', '-'], input=remote, text=True, capture_output=True, check=True)
    live = json.loads(result.stdout)
    snapshot.write_text(json.dumps(live), encoding='utf-8')
    for name, original in live.items():
        if original is None: print('NEW', name)
        elif (root/name).is_file():
            print('\n'.join(difflib.unified_diff(original.splitlines(), (root/name).read_text(encoding='utf-8').splitlines(), fromfile='live/'+name, tofile='local/'+name)))
    sys.exit(0)
live = json.loads(snapshot.read_text(encoding='utf-8'))
baseline = {n: hashlib.sha256(content.encode()).hexdigest() if content is not None else None for n, content in live.items()}
manifest = {n: hashlib.sha256((root/n).read_bytes()).hexdigest() for n in names}
archive = root/'deployment/dispatch-filter-reset-20261015.zip'
with zipfile.ZipFile(archive, 'w', zipfile.ZIP_DEFLATED) as z:
    for name in names: z.write(root/name, name)
    z.writestr('baseline.json', json.dumps(baseline)); z.writestr('manifest.json', json.dumps(manifest))
subprocess.run(['scp', *ssh[1:-1], str(archive), 'jeblast@103.196.146.186:/home/jeblast/dispatch-filter-reset-20261015.zip'], check=True)
remote = "import sys\nsys.path.insert(0, '/home/jeblast/repos/doran-whatsapp-server/deployment')\n" + (root/'deployment/deploy-dispatch-filter-reset-20261015.py').read_text()
sys.exit(subprocess.run(ssh+['python3', '-u', '-'], input=remote, text=True).returncode)

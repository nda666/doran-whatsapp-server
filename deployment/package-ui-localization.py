from pathlib import Path
import hashlib
import json
import zipfile

root = Path(__file__).resolve().parent.parent
files = json.loads((root / 'tmp/localization/deploy-files.json').read_text())
baseline = json.loads((root / 'tmp/localization/live-baseline.json').read_text())
changed = [name for name in files if hashlib.sha256((root / name).read_bytes()).hexdigest() != baseline[name]]
manifest = {name: hashlib.sha256((root / name).read_bytes()).hexdigest() for name in changed}
archive = root / 'deployment/localization-20261017.zip'
with zipfile.ZipFile(archive, 'w', zipfile.ZIP_DEFLATED) as out:
    out.writestr('manifest.json', json.dumps(manifest))
    out.writestr('baseline.json', json.dumps({name: baseline[name] for name in changed}))
    for name in changed:
        out.write(root / name, name)

template = (root / 'deployment/deploy-theme-colors-20261017.py').read_text()
template = template.replace('theme-colors', 'localization').replace('THEME_COLORS', 'UI_LOCALIZATION')
template = template.replace('prune_deploy_backups(backup.parent, backup)', '# Preserve existing backups; retention is outside this change.')
split = template.index("assert (app / '.next/BUILD_ID').read_text() == build_before")
prepare = template[:split] + '''stage_cleanup.preserve = True
metadata = {'app':str(app),'stage':str(stage),'backup':str(backup),'build_before':build_before,'manifest':manifest,'source_before':source_before}
Path('/home/jeblast/localization-prepared.json').write_text(json.dumps(metadata))
print('LOCALIZATION_PREPARED', stage, flush=True)
'''
promote = '''"""Promote the verified isolated build with source checks and automatic rollback."""
from pathlib import Path
import hashlib, json, os, shutil, subprocess, sys, time, urllib.request
sys.path.insert(0, '/home/jeblast/repos/doran-whatsapp-server/deployment')
from stage_cleanup import StageCleanup
metadata=json.loads(Path('/home/jeblast/localization-prepared.json').read_text())
app=Path(metadata['app']); stage=Path(metadata['stage']); backup=Path(metadata['backup'])
assert app == Path('/home/jeblast/repos/doran-whatsapp-server')
assert stage.parent == app.parent and stage.name.startswith('.doran-localization-')
assert backup.parent == Path('/home/jeblast/backups') and backup.name.startswith('doran-localization-')
os.environ['PATH']='/home/jeblast/.local/share/doran-node/node-v24.21.0-linux-x64/bin:'+os.environ['PATH']
build_before=metadata['build_before']; manifest=metadata['manifest']; source_before=metadata['source_before']
stage_cleanup=StageCleanup(app.parent, stage)
''' + template[split:]
(root / 'deployment/prepare-ui-localization-20261017.py').write_text(prepare)
(root / 'deployment/promote-ui-localization-20261017.py').write_text(promote)
print(json.dumps({'files':len(manifest),'archive':str(archive),'bytes':archive.stat().st_size},indent=2))

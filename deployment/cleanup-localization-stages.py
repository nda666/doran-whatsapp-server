"""Remove only this task's superseded build checkouts after successful deployment."""
from pathlib import Path
import subprocess
key=str(Path.home()/'.ssh/codex_wa_server_ed25519')
script='''from pathlib import Path
import json, sys
sys.path.insert(0,'/home/jeblast/repos/doran-whatsapp-server/deployment')
from stage_cleanup import StageCleanup
metadata=json.loads(Path('/home/jeblast/localization-prepared.json').read_text())
assert (Path(metadata['backup'])/'SUCCESS.json').is_file()
root=Path('/home/jeblast/repos')
for name in ['.doran-localization-1792214773','.doran-localization-1792214908','.doran-localization-1792216915']:
 stage=root/name
 assert stage.parent==root and stage.name==name and not stage.is_symlink()
 if stage.is_dir():StageCleanup(root,stage).cleanup()
print('SUPERSEDED_LOCALIZATION_STAGES_CLEANED')
'''
subprocess.run(['ssh','-o','BatchMode=yes','-o','ConnectTimeout=15','-i',key,'jeblast@103.196.146.186','python3','-'],input=script,text=True,check=True)

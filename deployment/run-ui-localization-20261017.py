from pathlib import Path
import subprocess
import sys
sys.stdout.reconfigure(encoding='utf-8')
root=Path(__file__).resolve().parent
key=str(Path.home()/'.ssh/codex_wa_server_ed25519')
host='jeblast@103.196.146.186'
options=['-o','BatchMode=yes','-o','ConnectTimeout=15','-i',key]
action=sys.argv[1] if len(sys.argv)>1 else 'prepare'
assert action in ['prepare','promote']
if action=='prepare':
    files=['localization-20261017.zip','prepare-ui-localization-20261017.py','promote-ui-localization-20261017.py']
    subprocess.run(['scp',*options,*[str(root/name)for name in files],host+':/home/jeblast/'],check=True)
script=f'/home/jeblast/{action}-ui-localization-20261017.py'
with (root/f'localization-{action}-20261017.log').open('w',encoding='utf-8')as log:
    process=subprocess.Popen(['ssh',*options,host,'flock -n /home/jeblast/.doran-deploy.lock python3 '+script],stdout=subprocess.PIPE,stderr=subprocess.STDOUT)
    for line in iter(process.stdout.readline,b''):
        text=line.decode('utf-8',errors='replace');log.write(text);log.flush();print(text,end='',flush=True)
    raise SystemExit(process.wait())

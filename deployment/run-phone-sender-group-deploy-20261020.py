from pathlib import Path
import subprocess
import sys
sys.stdout.reconfigure(encoding='utf-8')
root = Path(__file__).resolve().parent
key = str(Path.home()/'.ssh/codex_wa_server_ed25519')
host = 'jeblast@103.196.146.186'
options = ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=15', '-i', key]
files = ['phone-sender-group-20261020.zip', 'deploy-phone-sender-group-20261020.py', 'stage_cleanup.py', 'backup_retention.py']
subprocess.run(['scp', *options, *[str(root/name) for name in files], host + ':/home/jeblast/'], check=True)
print('PACKAGE_AND_DEPLOYER_UPLOADED', flush=True)
with (root/'phone-sender-group-deploy-20261020.log').open('w', encoding='utf-8') as log:
    process = subprocess.Popen(['ssh', *options, host, 'flock -n /home/jeblast/.doran-deploy.lock python3 /home/jeblast/deploy-phone-sender-group-20261020.py'], stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    for line in iter(process.stdout.readline, b''):
        text = line.decode('utf-8', errors='replace')
        log.write(text); log.flush(); print(text, end='', flush=True)
    code = process.wait()
    if code: raise SystemExit(code)

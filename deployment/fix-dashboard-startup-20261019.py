"""Install serialized boot startup without restarting healthy processes."""
from pathlib import Path
import subprocess

source = Path(__file__).with_name('start-jeblast-apps.sh').read_text(encoding='utf-8')
remote = r'''
from pathlib import Path
import datetime
import subprocess

home = Path('/home/jeblast')
target = home / '.local/bin/start-jeblast-apps.sh'
cron = subprocess.check_output(['crontab', '-l'], universal_newlines=True)
old = [
 '@reboot /usr/local/bin/pm2 start /home/jeblast/repos/doran-whatsapp-server/ecosystem.config.js --only doran-whatsapp >> /home/jeblast/.pm2/dashboard-startup.log 2>&1',
 '@reboot /usr/local/bin/pm2 start /home/jeblast/backendsms.jeblast.com/ecosystem.config.js --only backendsms >> /home/jeblast/.pm2/backendsms-startup.log 2>&1',
]
new = '@reboot /bin/bash /home/jeblast/.local/bin/start-jeblast-apps.sh >> /home/jeblast/.pm2/dashboard-startup.log 2>&1'
lines = cron.splitlines()
assert all(lines.count(line) == 1 for line in old), 'Unexpected cron configuration; no changes made'
backup = home / '.local/state/doran-startup' / datetime.datetime.now().strftime('%Y%m%d-%H%M%S')
backup.mkdir(parents=True, exist_ok=False)
backup.chmod(0o700)
(backup / 'crontab.before').write_text(cron)
if target.exists():
 (backup / 'start-jeblast-apps.sh.before').write_bytes(target.read_bytes())
target.parent.mkdir(parents=True, exist_ok=True)
target.write_text(SOURCE)
target.chmod(0o700)
subprocess.run(['/bin/bash', '-n', str(target)], check=True)
updated = []
for line in lines:
 if line == old[0]: updated.append(new)
 elif line != old[1]: updated.append(line)
updated = '\n'.join(updated) + '\n'
subprocess.run(['crontab', '-'], input=updated, universal_newlines=True, check=True)
assert subprocess.check_output(['crontab', '-l'], universal_newlines=True) == updated
print('STARTUP_INSTALLED backup=' + str(backup))
print('Existing PHP scheduler and daily maintenance preserved')
'''
remote = 'SOURCE = ' + repr(source) + '\n' + remote
result = subprocess.run([
    'ssh', '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=15',
    '-i', str(Path.home() / '.ssh/codex_wa_server_ed25519'),
    'jeblast@103.196.146.186', 'python3', '-'
], input=remote.encode('utf-8'))
raise SystemExit(result.returncode)

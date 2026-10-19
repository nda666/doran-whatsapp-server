#!/usr/bin/env bash
set -euo pipefail
cd /home/jeblast/repos/doran-whatsapp-server
test -s .next/BUILD_ID
test -s dist/src/server/index.js

# Prove the connection guard works before starting the application.
WHATSAPP_ENABLED=false QUEUE_ENABLED=false node <<'NODE'
const {default:makeWASocket,session}=require('./dist/src/server/libs/makeWASocket');
makeWASocket('offline-check','offline-check').then(()=>process.exit(1)).catch(error=>{
  if(error.message !== 'Koneksi WhatsApp dinonaktifkan sementara.' || session.size !== 0) process.exit(1);
  console.log('WHATSAPP_GUARD_OK');
  process.exit(0);
});
NODE

/usr/local/bin/pm2 startOrReload ecosystem.config.js --only doran-whatsapp --update-env
for attempt in $(seq 1 20); do
  if curl -fsS --max-time 5 http://127.0.0.1:3000/signin >/dev/null 2>&1; then break; fi
  sleep 1
done
curl -fsS --max-time 10 http://127.0.0.1:3000/signin >/dev/null

python3 - <<'PY'
from pathlib import Path
import re
p=Path('/home/jeblast/public_html/dashboard.jeblast.com/.htaccess')
existing=re.sub(r'# BEGIN Doran dashboard proxy.*?# END Doran dashboard proxy\s*', '', p.read_text(), flags=re.S)
proxy=Path('dashboard-proxy.htaccess').read_text()
p.write_text(proxy+'\n'+existing)
PY

# Save the new dashboard configuration while preserving other saved applications.
/usr/local/bin/pm2 save
python3 - <<'PY'
from pathlib import Path
import json
backup=Path(Path('.dashboard-backup-path').read_text().strip())
old=json.loads((backup/'pm2-dump.json').read_text())
p=Path('/home/jeblast/.pm2/dump.pm2')
current=json.loads(p.read_text())
names={entry['name'] for entry in current}
current.extend(entry for entry in old if entry['name'] not in names)
p.write_text(json.dumps(current,indent=2)+'\n')
p.chmod(0o600)
PY

python3 - <<'PY'
import subprocess
from pathlib import Path
old=subprocess.run(['crontab','-l'],stdout=subprocess.PIPE,stderr=subprocess.PIPE,universal_newlines=True)
if old.returncode not in (0,1): raise RuntimeError('Cannot read crontab')
backup=Path(Path('.dashboard-backup-path').read_text().strip())
if not (backup/'crontab-before.txt').exists(): (backup/'crontab-before.txt').write_text(old.stdout)
job='@reboot /usr/local/bin/pm2 start /home/jeblast/repos/doran-whatsapp-server/ecosystem.config.js --only doran-whatsapp >> /home/jeblast/.pm2/dashboard-startup.log 2>&1'
if job not in old.stdout:
    subprocess.run(['crontab','-'],input=old.stdout.rstrip()+'\n'+job+'\n',universal_newlines=True,check=True)
PY
echo DASHBOARD_ACTIVATED

"""Run read-only report checks from the production host over public HTTPS."""
from pathlib import Path
import subprocess
import sys
sys.stdout.reconfigure(encoding='utf-8')
root = Path(__file__).resolve().parent
remote = "cd /home/jeblast/repos/doran-whatsapp-server && /home/jeblast/.local/share/doran-node/node-v24.21.0-linux-x64/bin/node deployment/verify-phone-report-live.cjs"
result = subprocess.run(['ssh', '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=15', '-i', str(Path.home()/'.ssh/codex_wa_server_ed25519'), 'jeblast@103.196.146.186', remote], stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
output = result.stdout.decode('utf-8', errors='replace')
(root/'phone-report-public-verify-20261019.log').write_text(output, encoding='utf-8')
print(output, end='')
raise SystemExit(result.returncode)

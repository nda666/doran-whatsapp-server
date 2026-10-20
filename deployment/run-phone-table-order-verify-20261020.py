from pathlib import Path
import subprocess
root = Path(__file__).resolve().parent
subprocess.run(['ssh', '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=15', '-i', str(Path.home()/'.ssh/codex_wa_server_ed25519'), 'jeblast@103.196.146.186', 'cd /home/jeblast/repos/doran-whatsapp-server && /home/jeblast/.local/share/doran-node/node-v24.21.0-linux-x64/bin/node'], input=(root/'verify-phone-table-order-live.cjs').read_bytes(), check=True)

from pathlib import Path
import subprocess
root=Path(__file__).resolve().parent
options=['-o','BatchMode=yes','-o','ConnectTimeout=15','-i',str(Path.home()/'.ssh/codex_wa_server_ed25519')]
script=(root/'enable-all-adaptive-20261017.cjs').read_bytes()
result=subprocess.run(['ssh',*options,'jeblast@103.196.146.186','cd /home/jeblast/repos/doran-whatsapp-server && /home/jeblast/.local/share/doran-node/node-v24.21.0-linux-x64/bin/node -'],input=script,stdout=subprocess.PIPE,stderr=subprocess.STDOUT)
output=result.stdout.decode('utf-8',errors='replace')
(root/'enable-all-adaptive-result-20261017.log').write_text(output,encoding='utf-8')
print(output)
raise SystemExit(result.returncode)

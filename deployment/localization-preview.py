"""Start/stop an isolated Next preview; this never starts WhatsApp or queue workers."""
from pathlib import Path
import subprocess
import sys
action=sys.argv[1]
assert action in ['start','stop','status']
key=str(Path.home()/'.ssh/codex_wa_server_ed25519')
if action=='start':
 subprocess.run(['scp','-o','BatchMode=yes','-o','ConnectTimeout=15','-i',key,str(Path(__file__).with_name('localization-fixture-server.py')),'jeblast@103.196.146.186:/home/jeblast/localization-fixture-server.py'],check=True)
remote=r'''from pathlib import Path
import json, os, signal, subprocess, time, urllib.request
data=json.loads(Path('/home/jeblast/localization-prepared.json').read_text())
stage=Path(data['stage']); backup=Path(data['backup'])
assert stage.parent == Path('/home/jeblast/repos') and stage.name.startswith('.doran-localization-')
pidfile=backup/'preview.pid'
action=ACTION
if action=='start':
 env=dict(os.environ,NODE_ENV='production',WHATSAPP_ENABLED='false',DISPATCH_QUEUE_ENABLED='false',QUEUE_ENABLED='false',NEXTAUTH_URL='http://127.0.0.1:43108',NEXTAUTH_URL_INTERNAL='http://127.0.0.1:3108',NODE_OPTIONS='--max-old-space-size=2048')
 with (backup/'preview.log').open('w')as log:
  process=subprocess.Popen(['python3','/home/jeblast/localization-fixture-server.py'],cwd=stage,stdin=subprocess.DEVNULL,stdout=log,stderr=subprocess.STDOUT,start_new_session=True)
  guest=subprocess.Popen(['/home/jeblast/.local/share/doran-node/node-v24.21.0-linux-x64/bin/node',str(stage/'node_modules/next/dist/bin/next'),'start','-p','3108','-H','127.0.0.1'],cwd=stage,env=env,stdin=subprocess.DEVNULL,stdout=log,stderr=subprocess.STDOUT,start_new_session=True)
  (backup/'guest-preview.pid').write_text(str(guest.pid))
 pidfile.write_text(str(process.pid))
 for _ in range(40):
  try:
   if urllib.request.urlopen('http://127.0.0.1:3107/en/dashboard',timeout=3).status==200 and urllib.request.urlopen('http://127.0.0.1:3108/forgot-password',timeout=3).status==200:break
  except Exception:time.sleep(1)
 else:raise RuntimeError('Preview failed: '+(backup/'preview.log').read_text()[-3000:])
 print('PREVIEW_READY',process.pid)
elif action=='stop' and pidfile.exists():
 pid=int(pidfile.read_text());cmdline=Path('/proc')/str(pid)/'cmdline'
 if cmdline.exists():
  command=cmdline.read_bytes().decode(errors='replace')
  assert 'localization-fixture-server.py' in command
  os.kill(pid,signal.SIGTERM)
 pidfile.unlink()
 guestfile=backup/'guest-preview.pid'
 if guestfile.exists():
  guestpid=int(guestfile.read_text());guestcommand=Path('/proc')/str(guestpid)/'cmdline'
  if guestcommand.exists():
   assert 'next-server' in guestcommand.read_bytes().decode(errors='replace')
   os.kill(guestpid,signal.SIGTERM)
  guestfile.unlink()
 print('PREVIEW_STOPPED')
elif action=='status':
 print((backup/'build.log').read_text()[-3000:])
 if (backup/'preview.log').exists():print((backup/'preview.log').read_text()[-3000:])
 print('HTML_FILES',[str(p.relative_to(stage))for p in (stage/'.next/server/pages').rglob('dashboard.html')][:8])
'''.replace('ACTION',repr(action))
subprocess.run(['ssh','-o','BatchMode=yes','-o','ConnectTimeout=15','-i',key,'jeblast@103.196.146.186','python3','-'],input=remote,text=True,check=True)

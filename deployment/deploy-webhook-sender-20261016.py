"""Deploy only webhook handlers and their compiled modules, with baseline checks and rollback."""
from pathlib import Path
import base64, json, subprocess

root = Path(__file__).resolve().parent.parent
names = ['src/server/utils/webhookSender.ts', 'src/server/events/handleMessageInEvent.ts', 'src/server/events/handleQuotedMessageEvent.ts', 'deployment/verify-webhook-sender.cjs', 'deployment/verify-auto-reply-controls.cjs']
payload = {name: base64.b64encode((root/name).read_bytes()).decode() for name in names}
remote = r'''
from pathlib import Path
import base64, hashlib, json, os, shutil, subprocess, sys, time, urllib.request
app = Path('/home/jeblast/repos/doran-whatsapp-server')
sys.path.insert(0, str(app/'deployment'))
from stage_cleanup import StageCleanup
stamp = str(int(time.time()))
stage = app.parent/('.doran-webhook-sender-'+stamp)
backup = Path('/home/jeblast/backups')/('doran-webhook-sender-'+stamp)
stage.mkdir(mode=0o700)
backup.mkdir(mode=0o700)
cleanup = StageCleanup(app.parent, stage)
data = {name:base64.b64decode(value) for name,value in PAYLOAD.items()}
baseline = {}
for name, content in data.items():
    live = app/name
    old = live.read_bytes() if live.exists() else None
    baseline[name] = old
    expected = content.decode().replace('\r\n','\n')
    if name.endswith('handleMessageInEvent.ts'):
        expected = expected.replace('import { webhookSender } from "../utils/webhookSender";\n','').replace('sender: await webhookSender(messages[0].key, _waSocket),','sender: messages[0]?.key?.remoteJid!.split("@")[0]!,').replace('params["phone"] = data.sender ?? null;', 'params["phone"] = params["phone"] = data.sender ?? null;')
    elif name.endswith('handleQuotedMessageEvent.ts'):
        expected = expected.replace('import { webhookSender } from "../utils/webhookSender";\n','').replace('sender: await webhookSender(messages[0].key, waSocket),','sender: senderNum,').replace('params["phone"] = data.sender ?? null;', 'params["phone"] = senderNum ?? null;')
    elif name.endswith('verify-auto-reply-controls.cjs'):
        expected = expected.replace("    '../utils/webhookSender': {webhookSender:async()=> '628123456789'},\n",'')
    else:
        assert old is None, 'New file exists: '+name
        continue
    assert old is not None and old.decode().replace('\r\n','\n').rstrip() == expected.rstrip(), 'Live baseline differs: '+name
for name in ['src','prisma']:
    shutil.copytree(app/name, stage/name)
for name in ['tsconfig.json','tsconfig.server.json','next-env.d.ts','package.json']:
    shutil.copy2(app/name, stage/name)
(stage/'node_modules').symlink_to(app/'node_modules',target_is_directory=True)
for name,content in data.items():
    target=stage/name;target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(content)
config=json.loads((stage/'tsconfig.server.json').read_text())
config['compilerOptions'].update({'rootDir':'.','incremental':False})
config['include']=['next-env.d.ts','src/**/*.ts','src/**/*.tsx']
config['exclude']=['node_modules','dist']
(stage/'tsconfig.server.json').write_text(json.dumps(config))
node='/home/jeblast/.local/share/doran-node/node-v24.21.0-linux-x64/bin/node'
with (backup/'build.log').open('w') as log:
    for command in [[node,'node_modules/typescript/bin/tsc','--project','tsconfig.server.json'],[node,'deployment/verify-webhook-sender.cjs'],[node,'deployment/verify-auto-reply-controls.cjs']]:
        result=subprocess.run(command,cwd=stage,stdout=log,stderr=subprocess.STDOUT)
        if result.returncode:
            print((backup/'build.log').read_text()[-8000:],flush=True)
            raise RuntimeError('Validation failed')
print('STAGED_TYPESCRIPT_AND_REGRESSION_TESTS_PASSED',flush=True)
compiled=['dist/'+name[:-3]+'.js' for name in data if name.startswith('src/')]
for name in compiled:
    assert (stage/name).is_file(),name
    baseline[name]=(app/name).read_bytes() if (app/name).exists() else None
def pm2(*args):
    return subprocess.check_output(['/usr/local/bin/pm2',*args],cwd=app)
def processes():return {p['name']:p for p in json.loads(pm2('jlist'))}
before=processes()
telegram_pid=before.get('telegram-sender',{}).get('pid')
build_id=(app/'.next/BUILD_ID').read_text()
for name,old in baseline.items():
    live=app/name
    assert (live.read_bytes() if live.exists() else None)==old,'Concurrent change: '+name
    if old is not None:
        target=backup/name;target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(old)
(backup/'manifest.json').write_text(json.dumps({name:hashlib.sha256(old).hexdigest() if old is not None else None for name,old in baseline.items()}))
def ready():
    for _ in range(45):
        try:
            if urllib.request.urlopen('http://127.0.0.1:3000/signin',timeout=3).status==200:return True
        except Exception:pass
        time.sleep(1)
    return False
cleanup.preserve=True
pm2('stop','doran-whatsapp')
print('SERVER_STOPPED_FOR_MODULE_PROMOTION',flush=True)
try:
    for name in baseline:
        target=app/name;target.parent.mkdir(parents=True,exist_ok=True)
        shutil.copy2(stage/name,target)
    pm2('restart','doran-whatsapp')
    assert ready(),'Startup failed'
    after=processes()
    assert after['doran-whatsapp']['pm2_env']['status']=='online'
    for flag in ['WHATSAPP_ENABLED','DISPATCH_QUEUE_ENABLED']:
        assert after['doran-whatsapp']['pm2_env'].get(flag)==before['doran-whatsapp']['pm2_env'].get(flag)=='true'
    assert after.get('telegram-sender',{}).get('pid')==telegram_pid
    assert (app/'.next/BUILD_ID').read_text()==build_id
    for name in baseline:assert (app/name).read_bytes()==(stage/name).read_bytes(),name
except Exception:
    pm2('stop','doran-whatsapp')
    for name,old in baseline.items():
        if old is None:(app/name).unlink(missing_ok=True)
        else:(app/name).write_bytes(old)
    pm2('restart','doran-whatsapp')
    cleanup.preserve=False
    print('ROLLED_BACK',backup,flush=True)
    raise
cleanup.preserve=False
pm2('save')
(backup/'SUCCESS.json').write_text(json.dumps({'build_id':build_id.strip(),'files':list(baseline)}))
print('DEPLOYED_WEBHOOK_SENDER',backup,flush=True)
cleanup.cleanup()
'''
script = 'PAYLOAD = '+repr(payload)+'\n'+remote
result = subprocess.run(['ssh','-o','BatchMode=yes','-o','ConnectTimeout=15','-i',str(Path.home()/'.ssh/codex_wa_server_ed25519'),'jeblast@103.196.146.186','python3','-'],input=script,text=True)
raise SystemExit(result.returncode)

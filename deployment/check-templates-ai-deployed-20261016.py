from pathlib import Path
import json
import re
import subprocess
import urllib.request
import urllib.error

ssh = ['ssh', '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=15', '-i', str(Path.home()/'.ssh/codex_wa_server_ed25519'), 'jeblast@103.196.146.186']
remote = '''from pathlib import Path
import json,subprocess,re
a=Path('/home/jeblast/repos/doran-whatsapp-server')
b=Path('/home/jeblast/backups/doran-templates-ai-1792131572')
procs=json.loads(subprocess.check_output(['/usr/local/bin/pm2','jlist']))
print(json.dumps({'build':(a/'.next/BUILD_ID').read_text().strip(),'processes':[{'name':p['name'],'pid':p['pid'],'status':p['pm2_env']['status'],'restarts':p['pm2_env'].get('restart_time')} for p in procs],'encryption_configured':bool(re.search(r'^AI_SECRET_KEY=[a-fA-F0-9]{64}$',(a/'.env').read_text(),re.M)),'staging_removed':not Path('/home/jeblast/repos/.doran-templates-ai-1792131572').exists(),'database_backup_bytes':(b/'database-before.sql').stat().st_size,'staging_api':(b/'staging-api-check.log').read_text(),'production_api':(b/'production-api-check.log').read_text(),'success':json.loads((b/'SUCCESS.json').read_text())}))
'''
result = subprocess.run(ssh + ['python3', '-'], input=remote.encode(), capture_output=True, check=True)
data = json.loads(result.stdout)
for route in ['/signin', '/dashboard/message-templates', '/dashboard/ai-plugins']:
    try:
        response = urllib.request.urlopen(urllib.request.Request('https://dashboard.jeblast.com' + route + '?deploy=templates-ai-20261016', headers={'User-Agent':'Mozilla/5.0 DoranDeploymentVerification'}), timeout=25)
    except urllib.error.HTTPError as error:
        data.setdefault('public_http', []).append({'route':route,'status':error.code,'server':error.headers.get('server')})
        continue
    body = response.read().decode()
    found = re.search(r'"buildId":"([^"]+)"', body)
    data.setdefault('public_http', []).append({'route': route, 'status': response.status, 'final_url': response.url, 'build': found.group(1) if found else None})
    assert response.status == 200
    if found: assert found.group(1) == data['build'], 'Public site serves a different build'
assert data['encryption_configured'] and data['staging_removed']
assert 'TEMPLATES_AI_LIVE_OK' in data['production_api']
assert all(p['status'] == 'online' for p in data['processes'])
print(json.dumps(data, indent=2))
root = Path(__file__).resolve().parent.parent
(root/'deployment/templates-ai-deployed-20261016.json').write_text(json.dumps(data, indent=2))

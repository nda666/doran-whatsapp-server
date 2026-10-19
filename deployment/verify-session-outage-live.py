import hashlib, json, pathlib, re, subprocess, zipfile
app = pathlib.Path('/home/jeblast/repos/doran-whatsapp-server')
with zipfile.ZipFile('/home/jeblast/session-outage-20261013.zip') as archive:
 manifest = json.loads(archive.read('manifest.json'))
for name, digest in manifest.items():
 assert hashlib.sha256((app / name).read_bytes()).hexdigest() == digest, name
print('SOURCE_HASHES_OK')
def read(url):
 output=subprocess.check_output(['curl','-fsSL','--max-time','20','-w','\n%{http_code}\n%{url_effective}',url]).decode()
 body, status, final_url=output.rsplit('\n',2)
 assert status == '200', (url,status)
 return body, final_url
for base in ['http://127.0.0.1:3000', 'https://dashboard.jeblast.com']:
 html,_=read(base+'/signin')
 print('SIGNIN_OK',base)
 body,_=read(base+'/api/auth/session')
 assert json.loads(body) in [None,{}]
 print('SESSION_ENDPOINT_OK',base)
 if base.startswith('https'):
  paths=re.findall(r'<script[^>]+src="([^"]+)"',html)
  app_paths=[p for p in paths if '/_app-' in p]
  assert app_paths
  javascript,_=read(base+app_paths[0])
  assert '/api/auth/session' in javascript and 'unavailable' in javascript
  assert 'location.assign("/signout")' not in javascript
  print('PUBLIC_APP_BUNDLE_HAS_SESSION_FIX')
 _,url=read(base+'/dashboard/phone')
 assert '/signin' in url
 print('PROTECTED_PHONE_REDIRECT_OK',base)
processes=json.loads(subprocess.check_output(['/usr/local/bin/pm2','jlist']))
for p in processes:
 if p['name'] in ['doran-whatsapp','telegram-sender']:
  print(json.dumps({'name':p['name'],'pid':p['pid'],'status':p['pm2_env']['status'],'restart_time':p['pm2_env']['restart_time']}))
print('BUILD_ID',(app/'.next/BUILD_ID').read_text().strip())

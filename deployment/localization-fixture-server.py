"""Serve prerendered test artifacts with synthetic data. No auth secrets, DB, or app APIs."""
from pathlib import Path
from http.server import HTTPServer, BaseHTTPRequestHandler
from socketserver import ThreadingMixIn
from urllib.parse import urlparse
import json, mimetypes, gzip

metadata=json.loads(Path('/home/jeblast/localization-prepared.json').read_text())
stage=Path(metadata['stage'])
assert stage.parent == Path('/home/jeblast/repos') and stage.name.startswith('.doran-localization-')
session={'user':{'id':'localization-fixture','name':'Localization Fixture','email':'fixture@example.test','token':'fixture-only-not-a-credential','role':'USER','approvalStatus':'APPROVED','isActive':True,'sessionVersion':0},'expires':'2099-01-01T00:00:00.000Z'}

class Handler(BaseHTTPRequestHandler):
 protocol_version='HTTP/1.1'
 def log_message(self,*args):pass
 def send_json(self,data,status=200):
  body=json.dumps(data).encode();self.send_response(status);self.send_header('Content-Type','application/json');self.send_header('Content-Length',str(len(body)));self.end_headers();self.wfile.write(body)
 def do_GET(self):
  url=urlparse(self.path);name=url.path
  if name=='/api/auth/session':return self.send_json(session)
  if name=='/api/profile':return self.send_json(dict(session['user'],deviceLimit=5,plan='Fixture',devices=0))
  if name=='/api/message-templates':return self.send_json({'data':[],'total':0})
  if name.startswith('/api/'):
   return self.send_json({'message':'Data belum dapat dimuat.'},503)
  if name.startswith('/socket.io'):return self.send_json({},404)
  if name.startswith('/_next/static/'):
   target=stage/'.next/static'/name[len('/_next/static/'):]
  elif name.startswith('/_next/data/'):
   parts=name[len('/_next/data/'):].split('/',1)
   route=parts[1] if len(parts)>1 else ''
   if route.split('/')[0] not in ['id','en','es','ar','hi']:route='id/'+route
   target=stage/'.next/server/pages'/route
  else:
   route=name.lstrip('/')
   if route.split('/')[0] not in ['id','en','es','ar','hi']:route='id/'+route
   target=stage/'.next/server/pages'/(route+'.html')
   if not target.is_file():target=stage/'public'/name.lstrip('/')
  target=target.resolve()
  if stage not in target.parents or not target.is_file():return self.send_json({'missing':name},404)
  body=target.read_bytes();self.send_response(200);self.send_header('Content-Type',mimetypes.guess_type(str(target))[0]or'application/octet-stream')
  if 'gzip' in self.headers.get('Accept-Encoding',''):
   body=gzip.compress(body);self.send_header('Content-Encoding','gzip')
  if name.startswith('/_next/static/'):self.send_header('Cache-Control','public, max-age=3600, immutable')
  self.send_header('Content-Length',str(len(body)));self.end_headers();self.wfile.write(body)

class ThreadedServer(ThreadingMixIn, HTTPServer):
 daemon_threads=True
ThreadedServer(('127.0.0.1',3107),Handler).serve_forever()

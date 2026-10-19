"""Replay migrations against a disposable loopback MariaDB, never production."""
from pathlib import Path
import json
import os
import secrets
import socket
import subprocess
import time

ROOT=Path(__file__).resolve().parent.parent
BIN=Path('D:/laragon/bin/mysql/mariadb-11.6.2-winx64/bin')

def main():
    snapshots=sorted(p for p in (ROOT/'.recovery').iterdir() if (p/'verification.json').exists())
    snapshot=snapshots[-1]
    work=snapshot/('replay-'+str(int(time.time())))
    work.mkdir(exist_ok=False)
    port=33179
    with socket.socket() as s:
        if s.connect_ex(('127.0.0.1',port))==0:raise SystemExit('Disposable port already occupied; no database touched.')
    password=secrets.token_hex(24)
    env=dict(os.environ,MYSQL_PWD=password,DATABASE_URL=f'mysql://root:{password}@127.0.0.1:{port}/doran_recovery_test',WHATSAPP_ENABLED='false',QUEUE_ENABLED='false',DISPATCH_QUEUE_ENABLED='false')
    data=work/'data'
    def run(args,input=None,timeout=120):
        return subprocess.run([str(a) for a in args],input=input,capture_output=True,env=env,cwd=ROOT,timeout=timeout,creationflags=subprocess.CREATE_NO_WINDOW)
    init=run([BIN/'mariadb-install-db.exe',f'--datadir={data}',f'--port={port}',f'--password={password}','--silent'])
    (work/'init.log').write_bytes(init.stdout+init.stderr)
    assert init.returncode==0,'Disposable database initialization failed'
    with (work/'server.log').open('wb') as log:
        server=subprocess.Popen([str(BIN/'mysqld.exe'),f'--defaults-file={data / "my.ini"}',f'--datadir={data}','--bind-address=127.0.0.1',f'--port={port}','--console'],stdout=log,stderr=log,creationflags=subprocess.CREATE_NO_WINDOW)
        mysql=[BIN/'mysql.exe','--host=127.0.0.1',f'--port={port}','--user=root','--batch','--skip-column-names']
        try:
            for _ in range(45):
                if server.poll() is not None:raise RuntimeError('Disposable database stopped')
                if run(mysql+['-e','SELECT 1'],timeout=5).returncode==0:break
                time.sleep(1)
            else:raise RuntimeError('Disposable database not ready')
            assert run(mysql+['-e','CREATE DATABASE doran_recovery_test; CREATE DATABASE doran_recovery_live_schema;']).returncode==0
            migrate=run(['node','node_modules/prisma/build/index.js','migrate','deploy'])
            (work/'migrate.log').write_bytes(migrate.stdout+migrate.stderr)
            print('MIGRATION_REPLAY_EXIT',migrate.returncode)
            if migrate.returncode:
                print((migrate.stdout+migrate.stderr).decode(errors='replace').replace(password,'[REDACTED]')[-5000:])
                return
            live=run(mysql+['doran_recovery_live_schema'],input=(snapshot/'database-schema.sql').read_bytes())
            (work/'schema-import.log').write_bytes(live.stdout+live.stderr)
            assert live.returncode==0,'Production structure import failed'
            live_url=f'mysql://root:{password}@127.0.0.1:{port}/doran_recovery_live_schema'
            diff=run(['node','node_modules/prisma/build/index.js','migrate','diff','--from-url',env['DATABASE_URL'],'--to-url',live_url,'--script','--exit-code'])
            (work/'schema-diff.sql').write_bytes(diff.stdout)
            (work/'schema-diff.log').write_bytes(diff.stderr)
            align=run(mysql+['doran_recovery_test'],input=(ROOT/'prisma/recovery/align-with-production-20261012.sql').read_bytes())
            (work/'alignment.log').write_bytes(align.stdout+align.stderr)
            assert align.returncode==0,'Recovery alignment failed'
            final_diff=run(['node','node_modules/prisma/build/index.js','migrate','diff','--from-url',env['DATABASE_URL'],'--to-url',live_url,'--script','--exit-code'])
            (work/'final-schema-diff.sql').write_bytes(final_diff.stdout)
            (work/'final-schema-diff.log').write_bytes(final_diff.stderr)
            model=run(['node','node_modules/prisma/build/index.js','migrate','diff','--from-url',env['DATABASE_URL'],'--to-schema-datamodel','prisma/schema.prisma','--script','--exit-code'])
            (work/'model-diff.sql').write_bytes(model.stdout)
            (work/'model-diff.log').write_bytes(model.stderr)
            report={'migration_replay_passed':True,'live_schema_diff_before_alignment_exit':diff.returncode,'live_schema_diff_after_alignment_exit':final_diff.returncode,'recovery_matches_production':final_diff.returncode==0,'prisma_model_diff_exit':model.returncode,'test_database':'isolated localhost:33179/doran_recovery_test','server_stopped_after_test':True}
            (snapshot/'replay-verification.json').write_text(json.dumps(report,indent=2))
            print(json.dumps(report,indent=2))
            assert final_diff.returncode==0,'Recovered structure differs from production'
        finally:
            run([BIN/'mysqladmin.exe','--host=127.0.0.1',f'--port={port}','--user=root','shutdown'])
            try:server.wait(timeout=15)
            except subprocess.TimeoutExpired:server.terminate();server.wait(timeout=15)

if __name__=='__main__':
    try:main()
    except Exception as error:
        raise SystemExit('Recovery verification failed: '+type(error).__name__+'. Details suppressed to protect credentials.')

require('@next/env').loadEnvConfig(process.cwd());
const { spawnSync } = require('node:child_process');
const url = new URL(process.env.DATABASE_URL);
const result = spawnSync('/usr/bin/mysqldump', ['--single-transaction','--quick','--skip-lock-tables','--host='+url.hostname,'--port='+(url.port||'3306'),'--user='+decodeURIComponent(url.username),decodeURIComponent(url.pathname.slice(1))], { env: {...process.env, MYSQL_PWD:decodeURIComponent(url.password)}, stdio:['ignore',1,'pipe'] });
if (result.status !== 0) { console.error('Database backup failed'); process.exit(1); }

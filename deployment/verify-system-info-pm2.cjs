const assert = require('node:assert/strict');
const { summarizePm2 } = require('../dist/src/server/pm2Information');
const e = { status: 'online', exec_mode: 'fork_mode', instances: 1, pm_uptime: Date.now(),
  node_args: ['--max-old-space-size=4096'], max_memory_restart: 6144 * 1024 * 1024,
  exp_backoff_restart_delay: 1000, kill_timeout: 65000, log_date_format: 'YYYY-MM-DD HH:mm:ss Z', watch: false, autorestart: true,
  DATABASE_URL: 'SECRET_DATABASE', NEXTAUTH_SECRET: 'SECRET_AUTH', env: { private: 'SECRET_NESTED' } };
const row = { name: 'doran-whatsapp', pm_id: 1, pid: 42, monit: { memory: 512 * 1024 * 1024, cpu: 2.5 }, pm2_env: e };
const result = summarizePm2(row, [{ name: row.name, ...e }]);
assert.equal(result.savedMatches, true); assert.equal(result.memoryRestartMiB, 6144); assert.equal(result.heapMiB, 4096);
assert.equal(result.memoryMiB, 512); assert.equal(result.cpu, 2.5);
assert(!JSON.stringify(result).includes('SECRET')); assert(!('pm2_env' in result));
assert.equal(summarizePm2(row, [{ name: row.name, ...e, kill_timeout: 1000 }]).savedMatches, false);
assert.equal(summarizePm2(row, []).savedMatches, null);
console.log('PM2_ALLOWLIST_METRICS_AND_SAVED_CONFIG_COMPARISON_PASSED');

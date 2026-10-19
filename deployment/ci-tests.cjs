'use strict';
// Explicit offline allowlist. Never glob verify-*-live scripts into CI.
const { spawnSync } = require('node:child_process');
const tests = [
  'test-cd-readiness.cjs',
  'verify-registered-phones.cjs', 'verify-device-webhook.cjs',
  'verify-connection-status.cjs', 'verify-user-active.cjs',
  'verify-admin-user-token.cjs', 'verify-change-password.cjs',
  'verify-global-settings-password-reset.cjs', 'verify-dispatch-webhook.cjs',
  'verify-messaging-improvements.cjs', 'verify-pm2-optimization.cjs',
  'verify-device-delay-range.cjs', 'verify-upgrade.cjs',
  'verify-phone-last-qr-scan.cjs',
];
for (const test of tests) {
  console.log('TEST', test);
  const result = spawnSync(process.execPath, ['-r', './deployment/ci-register.cjs', `deployment/${test}`], {
    stdio: 'inherit', timeout: 120000,
    env: { ...process.env, DATABASE_URL: 'mysql://offline:unused@127.0.0.1:1/doran_offline',
      NEXTAUTH_SECRET: 'offline-fixture-secret', SETTINGS_ENCRYPTION_KEY: 'offline-fixture-encryption',
      WHATSAPP_ENABLED: 'false', QUEUE_ENABLED: 'false', DISPATCH_QUEUE_ENABLED: 'false' },
  });
  if (result.error || result.status !== 0) process.exit(1);
}
for (const test of ['verify-stage-cleanup.py', 'verify-backup-retention.py', 'test-cd-deploy.py']) {
  const result = spawnSync(process.platform === 'win32' ? 'python' : 'python3', [`deployment/${test}`], { stdio: 'inherit', timeout: 30000 });
  if (result.error || result.status !== 0) process.exit(1);
}
console.log('OFFLINE_REGRESSION_SUITE_PASSED');

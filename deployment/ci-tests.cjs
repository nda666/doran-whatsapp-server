'use strict';
// Explicit offline allowlist. Never glob verify-*-live scripts into CI.
const { spawnSync } = require('node:child_process');
const tests = [
  'verify-telegram.cjs',
  'verify-telegram-dispatch.cjs',
  'verify-test-send-types.cjs',
  'verify-local-device-channel.cjs',
  'test-cd-readiness.cjs',
  'verify-registered-phones.cjs', 'verify-device-webhook.cjs',
  'verify-connection-status.cjs', 'verify-pairing-identity.cjs', 'verify-user-active.cjs',
  'verify-admin-user-token.cjs', 'verify-change-password.cjs',
  'verify-global-settings-password-reset.cjs', 'verify-dispatch-webhook.cjs',
  'verify-webhook-worker-retry.cjs',
  'verify-messaging-improvements.cjs', 'verify-pm2-optimization.cjs',
  'verify-device-delay-range.cjs', 'verify-dispatch-delay-setting.cjs', 'verify-upgrade.cjs',
  'verify-phone-last-qr-scan.cjs',
  'verify-phone-last-offline.cjs', 'verify-phone-last-send.cjs',
  'verify-phone-sender-group.cjs', 'verify-phone-search-return.cjs',
  'verify-sender-number-membership.cjs',
  'verify-manual-sender-reassignment.cjs',
  'verify-phone-quota-filter.cjs',
  'verify-daily-warmup.cjs',
  'verify-warmup-restart.cjs',
  'verify-quota-recovery.cjs', 'verify-device-quota-reset.cjs',
  'verify-operating-hours.cjs', 'verify-dispatch-ack-retry.cjs',
  'verify-feature-schema.cjs',
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
for (const test of ['verify-stage-cleanup.py', 'verify-backup-retention.py', 'test-cd-deploy.py', 'test-private-snapshot.py']) {
  const result = spawnSync(process.platform === 'win32' ? 'python' : 'python3', [`deployment/${test}`], { stdio: 'inherit', timeout: 30000 });
  if (result.error || result.status !== 0) process.exit(1);
}
console.log('OFFLINE_REGRESSION_SUITE_PASSED');

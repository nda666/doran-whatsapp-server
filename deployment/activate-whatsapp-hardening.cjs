'use strict';
// User-authorized activation. Only opt-out preferences change; alert settings are preserved.
const fs = require('node:fs');
require('@next/env').loadEnvConfig(process.cwd(), false, { info() {}, error() {} });
const { prisma } = require('../dist/src/lib/prisma');
(async () => {
  if (process.env.WA_HARDENING_ACTIVATE !== '1' || !process.argv[2]) throw Error('Activation requires a private backup destination');
  const rows = await prisma.messagingPreference.findMany();
  fs.writeFileSync(process.argv[2], JSON.stringify(rows), { flag: 'wx', mode: 0o600 });
  const result = await prisma.messagingPreference.updateMany({ where: { optOutEnabled: false }, data: { optOutEnabled: true } });
  console.log('EXISTING_STOP_PREFERENCES_ENABLED', result.count);
})().catch(() => { console.error('STOP_ACTIVATION_FAILED'); process.exitCode = 1; }).finally(() => prisma.$disconnect());

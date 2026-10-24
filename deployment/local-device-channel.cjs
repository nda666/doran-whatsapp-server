'use strict';
const fs = require('node:fs'), path = require('node:path');

// Local bootstrap only. Production uses the existing hash-pinned deployment
// schema workflow, with its database + storage backup requirements.
async function ensureLocalDeviceChannel(options = {}) {
  const environment = options.environment || process.env;
  const url = new URL(environment.DATABASE_URL || '');
  if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) || url.pathname !== '/wa_local') throw Error('Device channel bootstrap is restricted to local wa_local');
  const root = options.root || path.resolve(__dirname, '..');
  const db = options.db || new (require('@prisma/client').PrismaClient)({ log: [] });
  try {
    const columns = await db.$queryRaw`SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'phones' AND COLUMN_NAME = 'channel'`;
    if (columns.length) return false;
    const operation = require('./cd-feature-schema.cjs').operations(root).find(op => op.kind === 'column' && op.table === 'phones' && op.name === 'channel');
    if (!operation) throw Error('Hash-pinned additive channel migration missing');
    const ddl = await db.$queryRawUnsafe('SHOW CREATE TABLE `phones`');
    const directory = options.backupDirectory || path.join(root, 'storage', 'local', 'schema-backups');
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(path.join(directory, `phones-before-channel-${Date.now()}.json`), JSON.stringify(ddl), { mode: 0o600, flag: 'wx' });
    await db.$executeRawUnsafe(operation.sql);
    return true;
  } finally { if (!options.db) await db.$disconnect(); }
}
module.exports = { ensureLocalDeviceChannel };

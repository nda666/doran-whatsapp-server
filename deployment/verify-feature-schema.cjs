'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const helper = require('./cd-feature-schema.cjs');
const ops = helper.operations();
assert.deepEqual(ops.filter(op => op.kind === 'table').map(op => op.table), ['device_quota_windows', 'sender_groups', 'wa_dispatch_attempts']);
assert(ops.some(op => op.kind === 'column' && op.name === 'operatingHours'));
assert(ops.some(op => op.kind === 'constraint' && op.name === 'wa_dispatch_attempts_dispatchId_fkey'));
assert(ops.some(op => op.kind === 'column' && op.name === 'quotaReset'));
assert(ops.some(op => op.kind === 'column' && op.table === 'phones' && op.name === 'channel'));
assert(ops.find(op => op.table === 'device_quota_windows').seedSql.startsWith('INSERT INTO `device_quota_windows`'));
helper.validateDiff(ops.map(op => op.sql).join(';\n') + ';');
helper.validateDiff('-- No difference\n');
for (const sql of [
  'DROP TABLE `phones`;', 'DELETE FROM `wa_dispatches`;',
  'UPDATE `_prisma_migrations` SET checksum = 1;',
  'ALTER TABLE `phones` DROP COLUMN `token`;',
  'ALTER TABLE `phones` MODIFY COLUMN `number` TEXT;',
  'ALTER TABLE `phones` ADD COLUMN `senderPriority` TEXT;',
  'ALTER TABLE `users` ADD COLUMN `senderPriority` INTEGER NOT NULL DEFAULT 0;',
  'CREATE TABLE `unknown` (`id` INTEGER);',
  'ALTER TABLE `phones` ADD COLUMN `senderPriority` INTEGER NOT NULL DEFAULT 0, DROP COLUMN `token`;',
]) assert.throws(() => helper.validateDiff(sql), /outside/);
for (const op of ops.filter(op => op.kind === 'index')) {
  const statement = op.action.replace(/^ADD (UNIQUE )?INDEX (`[^`]+`)\s*(\([\s\S]+\))$/, (_, unique, name, columns) => `CREATE ${unique || ''}INDEX ${name} ON \`${op.table}\`${columns}`);
  helper.validateDiff(statement + ';');
}
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'feature-schema-'));
try {
  assert.throws(() => helper.requireBackups(temp));
  fs.writeFileSync(path.join(temp, 'database.sql'), 'fixture');
  assert.throws(() => helper.requireBackups(temp));
  fs.writeFileSync(path.join(temp, 'storage-and-env.tar'), 'fixture');
  helper.requireBackups(temp);
} finally {
  for (const name of ['database.sql', 'storage-and-env.tar']) { const file = path.join(temp, name); if (fs.existsSync(file)) fs.unlinkSync(file); }
  fs.rmdirSync(temp);
}
console.log('APPROVED_FEATURE_SCHEMA_GUARDS_PASSED: hash-pinned additive allowlist, generated indexes, drift rejection and both backups required');

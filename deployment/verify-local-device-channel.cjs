'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const { ensureLocalDeviceChannel } = require('./local-device-channel.cjs');
const executed = [], queries = [];
let present = false;
const db = {
  $queryRaw: async parts => { queries.push(parts.join('')); return present ? [{ COLUMN_NAME: 'channel' }] : []; },
  $queryRawUnsafe: async sql => { assert.equal(sql, 'SHOW CREATE TABLE `phones`'); return [{ Table: 'phones', 'Create Table': 'fixture schema' }]; },
  $executeRawUnsafe: async sql => { executed.push(sql); present = true; },
};
(async () => {
  fs.mkdirSync(path.resolve('tmp'), { recursive: true });
  const backupDirectory = fs.mkdtempSync(path.resolve('tmp/local-channel-fixture-'));
  const options = { db, environment: { DATABASE_URL: 'mysql://offline:unused@127.0.0.1:3306/wa_local' }, backupDirectory };
  for (const url of ['mysql://u:p@production.example/wa_local', 'mysql://u:p@localhost/dory8752_from_local', 'mysql://u:p@localhost/other']) {
    await assert.rejects(() => ensureLocalDeviceChannel({ ...options, environment: { DATABASE_URL: url } }), /restricted/);
  }
  assert.equal(executed.length, 0);
  assert.equal(await ensureLocalDeviceChannel(options), true);
  assert.deepEqual(executed, ["ALTER TABLE `phones` ADD COLUMN `channel` VARCHAR(16) NOT NULL DEFAULT 'whatsapp'"]);
  assert.equal(fs.readdirSync(backupDirectory).length, 1);
  assert.equal(await ensureLocalDeviceChannel(options), false);
  assert.equal(executed.length, 1);
  assert.ok(queries.every(q => q.includes('information_schema.COLUMNS')));
  console.log('LOCAL_CHANNEL_BOOTSTRAP_PASSED: target isolation, schema snapshot, hash-pinned additive DDL, idempotent; mock database only');
})().catch(error => { console.error(error); process.exitCode = 1; });

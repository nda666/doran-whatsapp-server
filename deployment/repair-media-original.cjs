const fs = require('node:fs');
const assert = require('node:assert/strict');
require('@next/env').loadEnvConfig(process.cwd());
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
const backup = '/home/jeblast/backups/doran-media-original-20261010';
// This filename is taken from the media row in the pre-label database backup.
const identity = { id: '4749e7bf-1bd8-40e5-b2d9-841f6ce3157a', userId: '0d01050f-435d-4c1f-822e-81f6114d1ce7', filename: '53b5f69c-341c-464d-b4b8-b569aa4a8baa.jpg' };
const originalName = 'WhatsApp Image 2026-10-09 at 7.51.56 PM.jpeg';
(async () => {
  assert(fs.readFileSync('/home/jeblast/backups/doran-revision-20261010/database-before.sql', 'utf8').includes(`'${identity.id}','${identity.userId}','${originalName}'`));
  const before = await p.mediaAsset.findFirst({ where: identity });
  assert(before, 'Expected legacy media row not found');
  const snapshot = backup + '/legacy-media-before.json';
  assert(!fs.existsSync(snapshot)); fs.writeFileSync(snapshot, JSON.stringify(before, null, 2), { mode: 0o600 });
  const updated = await p.mediaAsset.updateMany({ where: { ...identity, originalName: null }, data: { originalName } });
  const after = await p.mediaAsset.findFirstOrThrow({ where: identity });
  assert.equal(after.name, before.name); assert.equal(after.filename, before.filename);
  assert(after.originalName); console.log('LEGACY_ORIGINAL_NAME_RESTORED_WITHOUT_CHANGING_LABEL', updated.count);
})().catch(error => { console.error(error.stack); process.exitCode = 1; }).finally(() => p.$disconnect());

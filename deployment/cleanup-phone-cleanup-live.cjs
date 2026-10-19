const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
require('@next/env').loadEnvConfig(process.cwd());
const { PrismaClient } = require('@prisma/client');
const db = new PrismaClient();
(async () => {
  const fixture = JSON.parse(await fs.readFile('deployment/phone-cleanup-live-fixture.json', 'utf8'));
  const phone = await db.phone.findUniqueOrThrow({ where: { id: fixture.phoneId } });
  const owner = await db.user.findUniqueOrThrow({ where: { id: fixture.userId } });
  assert.equal(phone.userId, owner.id); assert.equal(phone.name, fixture.label);
  assert.ok(owner.email.startsWith('codex-cleanup-') && owner.email.endsWith('@example.invalid'));
  assert.equal(phone.active, 0); assert.equal(phone.webhookUrl, 'https://example.invalid/cleanup-test', 'UI cancellation must preserve settings');
  const options = { disconnect: true, clearAuth: true, clearContacts: true, clearHistory: true, clearAutoReplies: true, resetToken: true, resetSettings: true, deleteRecord: true };
  const response = await fetch(`https://dashboard.jeblast.com/api/phones/${phone.id}`, { method: 'POST', headers: { Authorization: 'Bearer ' + owner.token, 'Content-Type': 'application/json' }, body: JSON.stringify(options) });
  assert.equal(response.status, 200); assert.equal(await db.phone.count({ where: { id: phone.id } }), 0);
  for (const id of fixture.testUserIds) await db.user.deleteMany({ where: { id, email: { startsWith: 'codex-cleanup-', endsWith: '@example.invalid' } } });
  assert.equal(await db.user.count({ where: { id: { in: fixture.testUserIds } } }), 0);
  console.log('UI_CANCEL_PRESERVED_SETTINGS_AND_ALL_TEMPORARY_FIXTURES_REMOVED');
})().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => db.$disconnect());

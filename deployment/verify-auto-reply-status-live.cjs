const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
require('@next/env').loadEnvConfig(process.cwd());
const { PrismaClient } = require('@prisma/client');
const db = new PrismaClient();
const keyword = 'codex-status-check-' + randomUUID();
let phoneId;
let ownerId;
(async () => {
  const user = await db.user.findFirstOrThrow({ where: { email: 'admin@gmail.com', role: 'ADMIN', isActive: true } });
  const phone = await db.phone.findFirstOrThrow({ where: { userId: user.id, autoReplyEnabled: false } });
  phoneId = phone.id;
  assert.equal(phone.autoReplyEnabled, false, 'Live checks require a disabled device');
  ownerId = phone.userId;
  const { encode } = require('next-auth/jwt');
  const jwt = await encode({ token: { id: user.id, token: user.token, name: user.name, email: user.email, role: user.role, approvalStatus: user.approvalStatus, sessionVersion: user.sessionVersion }, secret: process.env.NEXTAUTH_SECRET });
  const headers = { Cookie: '__Secure-next-auth.session-token=' + jwt + '; next-auth.session-token=' + jwt, Origin: 'https://dashboard.jeblast.com', 'Content-Type': 'application/json' };
  const body = { phoneId, keyword, type_message: 'webhook', type_keyword: 'Equal', reply_status: 'inactive', url: 'https://example.com/webhook', type_request: 'POST', isi_param_1: '', isi_param_2: '', isi_param_3: '' };
  async function save(payload, expected = 200) {
    const response = await fetch('https://dashboard.jeblast.com/api/auto_reply', { method: 'POST', headers, body: JSON.stringify(payload), signal: AbortSignal.timeout(15000) });
    assert.equal(response.status, expected, 'Webhook save HTTP status');
    return response.json();
  }
  const created = await save(body);
  const before = await db.autoReply.findUniqueOrThrow({ where: { id: created.id } });
  async function patch(status, device = phoneId, expected = 200) {
    const response = await fetch('https://dashboard.jeblast.com/api/auto_reply/' + created.id + '?phone_id=' + encodeURIComponent(device), {
      method: 'PATCH', headers, body: JSON.stringify({ reply_status: status, keyword: 'must-not-change' }), signal: AbortSignal.timeout(15000),
    });
    assert.equal(response.status, expected);
    return response.json();
  }
  for (const status of ['active', 'inactive']) {
    const result = await patch(status);
    assert.equal(result.reply_status, status);
    const stored = await db.autoReply.findUniqueOrThrow({ where: { id: created.id } });
    assert.equal(stored.reply_status, status);
    const { reply_status: oldStatus, updatedAt: oldTime, ...oldFields } = before;
    const { reply_status: newStatus, updatedAt: newTime, ...newFields } = stored;
    assert.deepEqual(newFields, oldFields, 'Only rule status and updated timestamp change');
  }
  await patch('invalid', phoneId, 400);
  await patch('active', 'wrong-device', 404);
  const response = await fetch('https://dashboard.jeblast.com/api/auto_reply/' + created.id + '?phone_id=' + encodeURIComponent(phoneId), {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reply_status: 'active' }),
  });
  assert.equal(response.status, 401);
  assert.equal((await db.autoReply.findUniqueOrThrow({ where: { id: created.id } })).reply_status, 'inactive');
  console.log('AUTO_REPLY_STATUS_LIVE_OK: activate/deactivate persisted, status-only change, invalid 400, wrong device 404, unauthenticated 401');
})().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(async () => {
  if (ownerId) {
    await db.autoReply.deleteMany({ where: { phoneId, userId: ownerId, keyword } });
    assert.equal(await db.autoReply.count({ where: { phoneId, keyword } }), 0);
    console.log('TEST_RULE_CLEANED: temporary rule removed; no messages sent');
  }
  await db.$disconnect();
});

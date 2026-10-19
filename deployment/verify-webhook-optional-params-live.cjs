const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
require('@next/env').loadEnvConfig(process.cwd());
const { PrismaClient } = require('@prisma/client');
const db = new PrismaClient();
const keyword = 'codex-webhook-check-' + randomUUID();
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
  let stored = await db.autoReply.findUniqueOrThrow({ where: { id: created.id } });
  assert.equal(stored.reply_status, 'inactive');
  for (let i = 1; i <= 3; i++) assert.equal(stored['isi_param_' + i], null);
  await save({ ...body, id: created.id, param_1: 'manual', isi_param_1: 'Custom', custom_input_1: 'value', param_2: 'sender', isi_param_2: 'Sender' });
  stored = await db.autoReply.findUniqueOrThrow({ where: { id: created.id } });
  assert.equal(stored.isi_param_1, 'Custom'); assert.equal(stored.custom_value_1, 'value');
  assert.equal(stored.isi_param_2, 'Sender'); assert.equal(stored.isi_param_3, null);
  await save({ ...body, id: created.id });
  stored = await db.autoReply.findUniqueOrThrow({ where: { id: created.id } });
  for (let i = 1; i <= 3; i++) assert.equal(stored['isi_param_' + i], null);
  await save({ ...body, id: created.id, isi_param_3: 'invalid' }, 400);
  console.log('WEBHOOK_OPTIONAL_PARAMS_LIVE_OK: HTTPS create/edit with empty params, mixed Custom/Sender, clearing params, invalid returns 400');
})().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(async () => {
  if (ownerId) {
    await db.autoReply.deleteMany({ where: { phoneId, userId: ownerId, keyword, reply_status: 'inactive' } });
    assert.equal(await db.autoReply.count({ where: { phoneId, keyword } }), 0);
    console.log('TEST_RULE_CLEANED: no active rules or messages sent');
  }
  await db.$disconnect();
});

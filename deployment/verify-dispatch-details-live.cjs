const assert = require('node:assert/strict');
require('@next/env').loadEnvConfig(process.cwd());
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
(async () => {
  const owner = await p.user.findFirstOrThrow({ where: { email: 'admin@gmail.com', role: 'ADMIN', approvalStatus: 'APPROVED' } });
  const headers = { Authorization: 'Bearer ' + owner.token };
  const base = 'https://dashboard.jeblast.com';
  const response = await fetch(base + '/api/dispatch?limit=5', { headers });
  assert.equal(response.status, 200);
  const result = await response.json();
  assert(result.data.length);
  for (const row of result.data) {
    if (row.status === 'QUEUED') assert(row.waiting_reason);
    assert(!('message' in row) && !('payload' in row) && !('image' in row));
  }
  const row = result.data[0];
  const detail = await fetch(base + '/api/dispatch?id=' + encodeURIComponent(row.id), { headers });
  assert.equal(detail.status, 200);
  const body = await detail.json();
  const saved = await p.waDispatch.findUniqueOrThrow({ where: { id: row.id } });
  assert.equal(body.message, saved.message);
  assert.equal(body.recipient, saved.recipient);
  assert.equal(body.content_available, !!(saved.message || saved.image || saved.payload || saved.mediaId));
  assert(!('leaseToken' in body) && !('dedupeKey' in body) && !('userId' in body));
  assert.equal((await fetch(base + '/api/dispatch?id=' + row.id)).status, 401);
  assert.equal((await fetch(base + '/api/dispatch?id=missing-dispatch', { headers })).status, 404);
  console.log('LIVE_WAITING_REASONS_DETAIL_MATCHES_STORED_MESSAGE_AUTH_AND_NOT_FOUND_OK_READ_ONLY');
})().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => p.$disconnect());

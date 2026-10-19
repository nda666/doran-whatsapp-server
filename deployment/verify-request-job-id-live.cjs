const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
require('@next/env').loadEnvConfig(process.cwd());
const { PrismaClient } = require('@prisma/client');
const db = new PrismaClient();
const jobId = 'verify-dry-run-' + randomUUID();
(async () => {
  const phone = await db.phone.findFirst(); assert(phone);
  async function post(path, body) {
    const response = await fetch('https://dashboard.jeblast.com' + path, {
      method: 'POST', headers: { Authorization: 'Bearer ' + phone.token, 'Content-Type': 'application/json' },
      body: JSON.stringify(body), signal: AbortSignal.timeout(20000),
    });
    return { status: response.status, body: await response.json() };
  }
  for (const path of ['/api/send-message', '/api/public/send-message', '/api/v2/send-message', '/api/public/v2/send-message']) {
    const result = await post(path, { job_id: jobId, dry_run: true, number: '6281217357535', message: 'Validation only' });
    assert.equal(result.status, 200); assert.equal(result.body.dry_run, true);
    assert.equal(result.body.deduplication_enabled, true);
    const invalid = await post(path, { job_id: [] });
    assert.equal(invalid.status, 400); assert.equal(invalid.body.result, false);
  }
  for (const path of ['/api/send-status', '/api/public/send-status']) {
    const result = await post(path, { job_id: jobId });
    assert.equal(result.status, 200); assert.equal(result.body.job_id, jobId);
    assert.equal(result.body.total, 0); assert.deepEqual(result.body.data, []);
  }
  for (const action of ['send-media', 'send-sticker', 'send-poll', 'send-button', 'send-list', 'send-location', 'send-vcard']) {
    for (const prefix of ['/api/', '/api/public/']) {
      const result = await post(prefix + action, { job_id: [] });
      assert.equal(result.status, 400); assert.equal(result.body.result, false);
    }
  }
  console.log('REQUEST_JOB_ID_LIVE_OK_ALIASES_STATUS_VALIDATION_NO_MESSAGES_OR_JOBS_CREATED');
})().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => db.$disconnect());

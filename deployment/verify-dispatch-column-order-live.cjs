const assert = require('node:assert/strict');
require('@next/env').loadEnvConfig(process.cwd());
const { PrismaClient } = require('@prisma/client');
const { createHash, randomUUID } = require('node:crypto');
const db = new PrismaClient();
(async () => {
  const owner = await db.user.findFirst({ where: { role: 'ADMIN', email: 'admin@gmail.com' } }); assert(owner);
  const headers = { Authorization: 'Bearer ' + owner.token };
  const get = async query => {
    const response = await fetch('https://dashboard.jeblast.com/api/dispatch?' + new URLSearchParams(query), { headers, signal: AbortSignal.timeout(20000) });
    assert.equal(response.status, 200); return response.json();
  };
  const job = await db.waDispatch.findFirst();
  if (job) {
    const body = await get({ job_id: job.id });
    assert.equal(body.total, 1); assert.equal(body.data[0].id, job.id);
    const filtered = await get({ job_id: job.id, phone_id: job.phoneId, status: job.status });
    assert(filtered.data.every(row => row.id === job.id));
  }
  const jobId = 'verify-no-match-' + randomUUID();
  const phoneIds = (await db.phone.findMany({ select: { id: true } })).map(row => row.id);
  const keys = phoneIds.map(id => createHash('sha256').update(JSON.stringify([id, jobId])).digest('hex'));
  const expected = await db.waDispatch.count({ where: { OR: [{ id: jobId }, { requestJobKey: { in: keys } }] } });
  const empty = await get({ job_id: jobId }); assert.equal(empty.total, expected); assert.equal(expected, 0);
  const invalid = await fetch('https://dashboard.jeblast.com/api/dispatch?job_id=' + 'x'.repeat(129), { headers }); assert.equal(invalid.status, 400);
  const unauth = await fetch('https://dashboard.jeblast.com/api/dispatch?job_id=' + jobId); assert.equal(unauth.status, 401);
  const { encode } = require('next-auth/jwt');
  const jwt = await encode({ token: { id: owner.id, token: owner.token, name: owner.name, email: owner.email }, secret: process.env.NEXTAUTH_SECRET });
  const page = await fetch('https://dashboard.jeblast.com/dashboard/dispatch', { headers: { Cookie: '__Secure-next-auth.session-token=' + jwt } });
  assert.equal(page.status, 200); const html = await page.text(); assert(html.includes('Cari Job ID')); assert(html.includes('Cari nama store')); assert(!html.includes('Cari ID store')); assert(html.includes('>Job ID</'));
  const head = html.match(/<thead\b[^>]*>([\s\S]*?)<\/thead>/); assert(head, 'Table header missing');
  const columnHeaders = Array.from(head[1].matchAll(/<th\b[^>]*>([\s\S]*?)<\/th>/g), match => match[1].replace(/<[^>]*>/g, '').trim());
  assert.deepEqual(columnHeaders, ['Pengirim','Penerima','Status','Dibuat','Percobaan','Job ID','ID transaksi','Store','Jenis pesan','Via','Keterangan','Aksi']);
  console.log('DISPATCH_COLUMN_ORDER_LIVE_OK');
  const rows = await get({ limit: '100' });
  for (const row of rows.data) {
    const stored = await db.waDispatch.findUnique({ where: { id: row.id } });
    assert(stored); assert.equal(row.job_id, stored.clientJobId || stored.id); assert.equal(row.store_id, stored.storeId);
  }
  if (job) { const storeRows = await get({ store_id: job.storeId }); assert(storeRows.data.every(row => row.store_id === job.storeId)); }
  const sorted = await get({ sort: 'job_id', order: 'asc' }); assert(Array.isArray(sorted.data));
  console.log('DISPATCH_JOB_SEARCH_LIVE_OK_AUTHENTICATED_PAGE_INTERNAL_ID_FILTER_NO_MATCH_VALIDATION_NO_WRITES');
})().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => db.$disconnect());

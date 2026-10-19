const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID, randomBytes } = require('node:crypto');
require('@next/env').loadEnvConfig(process.cwd());
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient(), base = 'http://127.0.0.1:3018';
assert.equal(process.env.WHATSAPP_ENABLED, 'false');
const prefix = 'revision-check-' + randomUUID();
const emails = ['a', 'b'].map(suffix => `${prefix}-${suffix}@example.invalid`);
let planId, createdCampaign;
async function request(route, user, method = 'GET', data) {
  const body = data instanceof FormData ? data : data ? JSON.stringify(data) : undefined;
  const r = await fetch(base + route, { method, headers: { ...(user ? { Authorization: 'Bearer ' + user.token } : {}), ...(body && !(data instanceof FormData) ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body } : {}) });
  const text = await r.text(); let result; try { result = JSON.parse(text); } catch { result = text; }
  return { status: r.status, data: result };
}
async function expect(route, user, status = 200, method, data) { const r = await request(route, user, method, data); assert.equal(r.status, status, route + ' ' + JSON.stringify(r.data).slice(0, 180)); return r.data; }
async function multipart(user, labels, unsupported = false) {
  const body = new FormData(); body.append('file', new Blob(['fixture one'], { type: 'text/plain' }), 'original-one.txt');
  body.append('file', new Blob(['fixture two'], { type: unsupported ? 'application/x-msdownload' : 'text/plain' }), unsupported ? 'invalid.exe' : 'original-two.txt');
  body.append('labels', JSON.stringify(labels)); return request('/api/media', user, 'POST', body);
}
(async () => {
  const admin = await p.user.findUniqueOrThrow({ where: { email: 'admin@gmail.com' } });
  const users = [];
  for (const email of emails) users.push(await p.user.create({ data: { email, name: prefix, password: 'Disabled synthetic credential ' + randomUUID(), token: randomUUID(), approvalStatus: 'APPROVED' } }));
  const [a, b] = users;
  await p.phone.create({ data: { userId: b.id, name: prefix + '-private-B', active: 0 } });
  const groups = [], phones = [];
  for (let i = 0; i < 6; i++) {
    const name = prefix + '-' + (9 - i);
    const phone = await p.phone.create({ data: { userId: a.id, name, active: 0 } }); phones.push(phone);
    const group = await p.contactGroup.create({ data: { userId: a.id, name } }); groups.push(group);
    await p.contact.create({ data: { userId: a.id, name, number: '628111222' + (100 + i), groupId: group.id } });
    const campaign = await p.campaign.create({ data: { userId: a.id, name, message: 'Fixture only', phoneIds: [phone.id], scheduledAt: new Date(), status: 'COMPLETED' } });
    await p.waDispatch.create({ data: { userId: a.id, phoneId: phone.id, campaignId: campaign.id, storeId: prefix, transactionId: name, messageKey: name, recipient: '628111222' + (100 + i), dedupeKey: randomBytes(32).toString('hex'), payloadHash: randomBytes(32).toString('hex'), message: 'Fixture only', status: 'FAILED', expiresAt: new Date() } });
    await p.inboxMessage.create({ data: { userId: a.id, sender: name, recipient: name, message: 'Fixture only' } });
  }
  const day = new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10);
  const routes = [ ['/api/phones', 'name'], ['/api/contacts', 'name'], ['/api/campaigns', 'name'], ['/api/dispatch', 'transaction_id'], ['/api/log', 'sender'], [`/api/reports?start=${day}&end=${day}`, 'recipient'] ];
  for (const [route, field] of routes) {
    const sep = route.includes('?') ? '&' : '?';
    const first = await expect(route + sep + 'page=1&sort=' + field + '&order=asc', a);
    const second = await expect(route + sep + 'page=2&sort=' + field + '&order=asc', a);
    assert.equal(first.data.length, 5); assert.equal(second.data.length, 1);
    assert(!first.data.some(x => second.data.some(y => x.id === y.id)));
    const all = await expect(route + sep + 'page=1&limit=10&sort=' + field + '&order=asc', a);
    const descending = await expect(route + sep + 'page=1&limit=10&sort=' + field + '&order=desc', a);
    assert.equal(all.data.length, 6); assert.deepEqual(all.data.map(row => row.id), descending.data.map(row => row.id).reverse());
    await expect(route + sep + 'sort=' + encodeURIComponent('name; DROP TABLE users') + '&limit=999999', a);
    console.log('PAGINATION_DEFAULT_5_SERVER_SORT_ALL_ROWS_OK', route);
  }
  const grouped = await expect('/api/contacts?limit=10&sort=group.name&order=asc', a); assert.deepEqual(grouped.data.map(c => c.group.name), grouped.data.map(c => c.group.name).sort());
  const uploaded = await multipart(a, ['Brosur fixture', 'Promo fixture']); assert.equal(uploaded.status, 201); assert.equal(uploaded.data.data.length, 2);
  const assets = uploaded.data.data; assert.equal(assets[0].name, 'Brosur fixture'); assert.equal(assets[0].originalName, 'original-one.txt');
  const content = await fetch(base + '/api/media/' + assets[0].id, { headers: { Authorization: 'Bearer ' + a.token } }); assert.equal(content.status, 200); assert((content.headers.get('content-disposition') || '').includes('original-one.txt')); assert.equal(await content.text(), 'fixture one');
  await expect('/api/media/' + assets[0].id, a, 200, 'PATCH', { name: 'Label baru' });
  await expect('/api/media/' + assets[0].id, b, 404, 'PATCH', { name: 'Forbidden' });
  const selected = await expect('/api/media?q=Label%20baru', a); assert.equal(selected.data[0].id, assets[0].id);
  const directory = path.join(process.cwd(), 'storage/campaign-media'), before = (await fs.readdir(directory)).sort();
  assert.equal((await multipart(a, ['', 'invalid'])).status, 400);
  assert.equal((await multipart(a, ['valid', 'invalid'], true)).status, 400);
  assert.deepEqual((await fs.readdir(directory)).sort(), before); assert.equal(await p.mediaAsset.count({ where: { userId: a.id } }), 2);
  console.log('MULTIPLE_UPLOAD_LABEL_RENAME_ORIGINAL_DOWNLOAD_ATOMIC_REJECTION_OWNER_SCOPE_OK');
  await expect('/api/admin/plans', a, 403);
  const plan = await expect('/api/admin/plans', admin, 201, 'POST', { name: prefix, deviceLimit: 8, description: 'Fixture only', active: true }); planId = plan.id;
  await expect('/api/admin/users', admin, 200, 'POST', { id: a.id, name: prefix, email: a.email, role: 'USER', plan: plan.name, deviceLimit: 8, subscriptionExpiresAt: '2030-12-31T16:45:00.000Z' });
  const updatedUser = await p.user.findUniqueOrThrow({ where: { id: a.id } }); assert.equal(updatedUser.subscriptionExpiresAt.toISOString(), '2030-12-31T16:45:00.000Z');
  await expect('/api/admin/plans', admin, 200, 'POST', { ...plan, name: prefix + '-renamed' });
  assert.equal((await p.user.findUniqueOrThrow({ where: { id: a.id } })).plan, prefix + '-renamed');
  await expect('/api/admin/plans', admin, 409, 'DELETE', { id: plan.id });
  const standard = await p.subscriptionPlan.findUniqueOrThrow({ where: { name: 'Standard' } });
  await expect('/api/admin/plans', admin, 409, 'POST', { ...standard, active: false }); assert((await p.subscriptionPlan.findUniqueOrThrow({ where: { name: 'Standard' } })).active);
  await expect('/api/admin/users?sort=plan&order=asc&limit=5', admin);
  await expect('/api/admin/users', admin, 400, 'POST', { id: a.id, name: prefix, email: a.email, role: 'USER', plan: 'Nonexistent plan', deviceLimit: 8 });
  console.log('MASTER_PLAN_ADMIN_ACCESS_RENAME_REFERENCES_IN_USE_DELETE_PROTECTED_DROPDOWN_VALIDATION_24H_TIMESTAMP_OK');
  const sender = await p.phone.findFirstOrThrow({ where: { userId: admin.id, active: 1 } });
  const scheduledAt = new Date(Date.now() + 3 * 86400000).toISOString();
  const campaign = await p.campaign.create({ data: { userId: a.id, name: prefix + '-edit', message: 'Old', phoneIds: [phones[0].id], scheduledAt: new Date(scheduledAt), status: 'PAUSED' } });
  await p.waDispatch.create({ data: { userId: a.id, phoneId: phones[0].id, campaignId: campaign.id, storeId: prefix, transactionId: campaign.id, messageKey: 'campaign', recipient: '628111222999', message: 'Old', status: 'QUEUED', nextAttemptAt: new Date(scheduledAt), expiresAt: new Date(Date.now() + 5 * 86400000), dedupeKey: randomBytes(32).toString('hex'), payloadHash: randomBytes(32).toString('hex') } });
  const input = { id: campaign.id, name: campaign.name, message: 'Halo {nama}, {nomor}', phoneIds: [sender.id], recipients: [{ number: '628111222999', name: 'Fixture' }], scheduledAt, delayMin: 5, delayMax: 15 };
  await expect('/api/campaigns/' + campaign.id, b, 404, 'PATCH', { ...input, action: 'edit' });
  await expect('/api/campaigns/' + campaign.id, a, 400, 'PATCH', { ...input, action: 'edit' });
  await expect('/api/campaigns/' + campaign.id, admin, 200, 'PATCH', { ...input, action: 'edit' });
  const job = await p.waDispatch.findFirstOrThrow({ where: { campaignId: campaign.id } }); assert.equal(job.message, 'Halo Fixture, 628111222999'); assert.equal(job.userId, a.id); assert.equal((await p.campaign.findUniqueOrThrow({ where: { id: campaign.id } })).status, 'PAUSED');
  await p.waDispatch.update({ where: { id: job.id }, data: { status: 'FAILED', attempts: 1 } });
  await expect('/api/campaigns/' + campaign.id, admin, 409, 'PATCH', { ...input, action: 'edit' });
  createdCampaign = randomUUID();
  await expect('/api/campaigns', admin, 201, 'POST', { ...input, id: createdCampaign, name: prefix + '-new' });
  const created = await p.campaign.findUniqueOrThrow({ where: { id: createdCampaign } }); assert(created.audience); assert.equal(created.scheduledAt.toISOString(), scheduledAt);
  console.log('CAMPAIGN_FUTURE_CREATE_PERSONALISATION_EDIT_LOCK_OWNER_PRESERVED_STARTED_REJECTED_OK_NO_MESSAGES_SENT');
})().catch(error => { console.error(error.stack); process.exitCode = 1; }).finally(async () => {
  const users = await p.user.findMany({ where: { email: { in: emails } } }); assert(users.every(u => u.email.startsWith(prefix) && u.email.endsWith('@example.invalid')));
  const where = { userId: { in: users.map(u => u.id) } };
  const assets = await p.mediaAsset.findMany({ where });
  if (createdCampaign) { await p.waDispatch.deleteMany({ where: { campaignId: createdCampaign } }); await p.campaign.deleteMany({ where: { id: createdCampaign, name: prefix + '-new' } }); }
  await p.waDispatch.deleteMany({ where }); await p.campaign.deleteMany({ where }); await p.autoReply.deleteMany({ where }); await p.inboxMessage.deleteMany({ where });
  await p.contact.deleteMany({ where }); await p.contactGroup.deleteMany({ where }); await p.deviceContact.deleteMany({ where }); await p.mediaAsset.deleteMany({ where });
  for (const asset of assets) await fs.unlink(path.join(process.cwd(), 'storage/campaign-media', asset.filename)).catch(() => {});
  await p.phone.deleteMany({ where }); await p.user.deleteMany({ where: { email: { in: emails } } });
  if (planId) await p.subscriptionPlan.deleteMany({ where: { id: planId, name: { startsWith: prefix } } });
  console.log('EXACT_REVISION_FIXTURES_REMOVED_NO_PRODUCTION_DEVICE_CHANGED'); await p.$disconnect();
});

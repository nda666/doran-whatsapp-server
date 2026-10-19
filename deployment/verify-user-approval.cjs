const assert = require('node:assert/strict');
const { randomUUID, randomBytes } = require('node:crypto');
require('@next/env').loadEnvConfig(process.cwd());
const { PrismaClient } = require('@prisma/client');
const { encode } = require('next-auth/jwt');
const { io } = require('socket.io-client');
const p = new PrismaClient();
const base = 'http://127.0.0.1:3018';
assert.equal(process.env.WHATSAPP_ENABLED, 'false');
assert.equal(process.env.DISPATCH_QUEUE_ENABLED, 'false');
const prefix = 'approval-check-' + randomUUID();
const emails = ['a', 'b', 'legacy'].map(s => `${prefix}-${s}@example.invalid`);
const password = randomBytes(24).toString('hex');
async function request(path, user, method = 'GET', body) {
  const response = await fetch(base + path, { method, redirect: 'manual', headers: {
    ...(user ? { Authorization: 'Bearer ' + user.token } : {}), ...(body ? { 'Content-Type': 'application/json' } : {})
  }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const text = await response.text();
  let data; try { data = JSON.parse(text); } catch { data = text; }
  return { status: response.status, data };
}
async function expect(path, user, status = 200, method, body) {
  const r = await request(path, user, method, body);
  assert.equal(r.status, status, path + ' ' + JSON.stringify(r.data).slice(0, 200)); return r.data;
}
async function socketCheck(user, allowed) {
  await new Promise((resolve, reject) => {
    const socket = io(base, { auth: { token: user.token }, transports: ['websocket'], reconnection: false });
    const timer = setTimeout(() => { socket.close(); reject(new Error('Socket timeout')); }, 8000);
    const finish = ok => { clearTimeout(timer); socket.close(); ok ? resolve() : reject(new Error('Socket approval mismatch')); };
    socket.on('connect', () => finish(allowed)); socket.on('connect_error', () => finish(!allowed));
  });
}
async function session(user) {
  const jwt = await encode({ token: { id: user.id, email: user.email }, secret: process.env.NEXTAUTH_SECRET });
  const response = await fetch(base + '/api/auth/session', { headers: { Cookie: 'next-auth.session-token=' + jwt } });
  assert.equal(response.status, 200); return response.json();
}
async function fixture(user, suffix) {
  const name = prefix + suffix;
  const phone = await p.phone.create({ data: { userId: user.id, name, active: 0 } });
  const group = await p.contactGroup.create({ data: { userId: user.id, name } });
  const contact = await p.contact.create({ data: { userId: user.id, name, number: suffix === 'A' ? '628111000001' : '628111000002', groupId: group.id } });
  const media = await p.mediaAsset.create({ data: { userId: user.id, name, mime: 'text/plain', size: 0, filename: randomUUID() + '.txt' } });
  const campaign = await p.campaign.create({ data: { userId: user.id, name, message: 'Fixture only', phoneIds: [phone.id], scheduledAt: new Date(), status: 'COMPLETED' } });
  const dispatch = await p.waDispatch.create({ data: { userId: user.id, phoneId: phone.id, storeId: prefix, transactionId: name, messageKey: name, recipient: contact.number, dedupeKey: randomBytes(32).toString('hex'), payloadHash: randomBytes(32).toString('hex'), message: 'Fixture only', status: 'FAILED', expiresAt: new Date(), campaignId: campaign.id } });
  const inbox = await p.inboxMessage.create({ data: { userId: user.id, sender: name, recipient: name, message: 'Fixture only' } });
  const reply = await p.autoReply.create({ data: { userId: user.id, phoneId: phone.id, keyword: name, reply: 'Fixture only', reply_status: 'inactive' } });
  return { phone, group, contact, media, campaign, dispatch, inbox, reply };
}
(async () => {
  const admin = await p.user.findUniqueOrThrow({ where: { email: 'admin@gmail.com' } });
  assert.equal(admin.role, 'ADMIN'); assert.equal(admin.approvalStatus, 'APPROVED');
  for (const page of ['/signin', '/signup']) assert.equal((await request(page)).status, 200, page);
  await expect('/api/signup', null, 400, 'POST', { name: 'bad', email: 'bad', password: 'short', passwordConfirm: 'short' });
  const signup = { name: prefix, email: emails[0].toUpperCase(), password, passwordConfirm: password, role: 'ADMIN', approvalStatus: 'APPROVED' };
  await expect('/api/signup', null, 201, 'POST', signup);
  let a = await p.user.findUniqueOrThrow({ where: { email: emails[0] } });
  assert.equal(a.role, 'USER'); assert.equal(a.approvalStatus, 'PENDING');
  await expect('/api/signin', null, 403, 'POST', { email: a.email, password });
  await expect('/api/phones', a, 403); await socketCheck(a, false); assert.equal((await session(a)).user, undefined);
  const pending = await expect('/api/admin/users?status=PENDING&q=' + prefix, admin);
  assert(pending.data.some(u => u.id === a.id));
  await expect(`/api/admin/users/${a.id}/approval`, admin, 200, 'PATCH', { approvalStatus: 'APPROVED' });
  a = await p.user.findUniqueOrThrow({ where: { id: a.id } });
  await expect('/api/signin', null, 200, 'POST', { email: a.email.toUpperCase(), password });
  await expect(`/api/admin/users/${a.id}/approval`, a, 403, 'PATCH', { approvalStatus: 'APPROVED' });
  await socketCheck(a, true); assert.equal((await session(a)).user.role, 'USER');
  await expect('/api/admin/users', admin, 201, 'POST', { name: prefix, email: emails[1], password, role: 'ADMIN', deviceLimit: 100, plan: 'Standard' });
  const b = await p.user.findUniqueOrThrow({ where: { email: emails[1] } });
  assert.equal(b.approvalStatus, 'APPROVED'); await expect('/api/signin', null, 200, 'POST', { email: b.email, password });
  await expect('/api/regis', null, 201, 'POST', { ...signup, email: emails[2] });
  const legacy = await p.user.findUniqueOrThrow({ where: { email: emails[2] } }); assert.equal(legacy.approvalStatus, 'PENDING');
  await expect(`/api/admin/users/${legacy.id}/approval`, admin, 200, 'PATCH', { approvalStatus: 'REJECTED' });
  await expect('/api/signin', null, 403, 'POST', { email: legacy.email, password }); await socketCheck(legacy, false);
  await expect(`/api/admin/users/${admin.id}/approval`, b, 403, 'PATCH', { approvalStatus: 'REJECTED' });
  console.log('PUBLIC_SIGNUP_PENDING_MANUAL_APPROVED_APPROVAL_REJECTION_SESSION_SOCKET_OK');
  const fa = await fixture(a, 'A'), fb = await fixture(b, 'B');
  const day = new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10);
  const routes = [
    ['/api/phones?name=' + prefix, 'phone'], ['/api/phones?options=1', 'phone'],
    ['/api/contacts?q=' + prefix, 'contact'], ['/api/contacts/groups', 'group'], ['/api/media', 'media'],
    ['/api/campaigns', 'campaign'], ['/api/dispatch?store_id=' + prefix, 'dispatch'],
    ['/api/log?sender=' + prefix, 'inbox'], ['/api/inbox_message?sender_number=' + fb.inbox.sender, 'inbox'],
    [`/api/reports?start=${day}&end=${day}`, 'dispatch']
  ];
  for (const [route, key] of routes) {
    const rows = data => (Array.isArray(data) ? data : data.data).map(row => row.id);
    const ar = rows(await expect(route, a)), br = rows(await expect(route, b)), sr = rows(await expect(route, admin));
    assert(!ar.includes(fb[key].id), 'User A leak ' + route);
    assert(!br.includes(fa[key].id), 'Other admin leak ' + route);
    assert(sr.includes(fb[key].id), 'Super admin missing B ' + route);
    if (!route.startsWith('/api/inbox_message')) { assert(ar.includes(fa[key].id), 'User A missing own ' + route); assert(br.includes(fb[key].id), 'User B missing own ' + route); }
    console.log('TENANT_SCOPE_OK', route);
  }
  const searchA = JSON.stringify(await expect('/api/search?q=' + prefix, a)); assert(!searchA.includes(fb.phone.id)); assert(searchA.includes(fa.phone.id));
  const searchAdmin = JSON.stringify(await expect('/api/search?q=' + prefix, admin)); assert(searchAdmin.includes(fb.phone.id));
  assert.equal((await expect('/api/dashboard-stats', a)).devices, 1); assert.equal((await expect('/api/dashboard-stats', b)).devices, 1);
  assert.equal((await expect('/api/dashboard-stats', admin)).devices, await p.phone.count()); assert.equal((await expect('/api/dashboard-stats', admin)).unrestricted, true);
  const csv = await expect('/api/contacts?export=csv&q=' + prefix, a); assert(csv.includes(fa.contact.name)); assert(!csv.includes(fb.contact.name));
  const report = await expect(`/api/reports?start=${day}&end=${day}&export=csv`, a); assert(report.includes(fa.dispatch.id)); assert(!report.includes(fb.dispatch.id));
  await expect('/api/campaigns/' + fb.campaign.id, a, 404); await expect('/api/campaigns/' + fb.campaign.id, admin);
  await expect('/api/media/' + fb.media.id, a, 404);
  await expect('/api/phones', a, 404, 'POST', { id: fb.phone.id, name: 'Forbidden' });
  await expect('/api/phones/' + fb.phone.id + '/toggle-active', a, 404, 'PATCH', { active: 1 });
  await expect('/api/phones/' + fb.phone.id, a, 404, 'DELETE');
  await expect('/api/contacts', a, 404, 'POST', { id: fb.contact.id, name: 'Forbidden', number: fb.contact.number });
  assert.equal((await expect('/api/contacts/groups', a, 200, 'POST', { id: fb.group.id, name: 'Forbidden' })).count, 0);
  assert.equal((await expect('/api/contacts', a, 200, 'DELETE', { id: fb.contact.id })).count, 0);
  assert.deepEqual(await expect('/api/auto_reply?phone_id=' + fb.phone.id, a), []);
  assert.equal((await expect('/api/auto_reply?phone_id=' + fb.phone.id, admin)).length, 1);
  await expect('/api/auto_reply', a, 404, 'POST', { id: fb.reply.id, type_message: 'text', type_keyword: 'Equal', keyword: 'Forbidden', reply: 'Forbidden' });
  assert.equal((await p.phone.findUniqueOrThrow({ where: { id: fb.phone.id } })).name, fb.phone.name);
  console.log('CROSS_OWNER_READ_WRITE_DENIED_EXPORTS_STATS_SUPER_ADMIN_ALL_OK_NO_MESSAGES_SENT');
})().catch(error => { console.error(error.stack); process.exitCode = 1; }).finally(async () => {
  const users = await p.user.findMany({ where: { email: { in: emails } }, select: { id: true, email: true } });
  const ids = users.map(u => u.id); assert(users.every(u => u.email.startsWith(prefix) && u.email.endsWith('@example.invalid')));
  if (ids.length) {
    const where = { userId: { in: ids } };
    await p.waDispatch.deleteMany({ where }); await p.campaign.deleteMany({ where }); await p.autoReply.deleteMany({ where });
    await p.inboxMessage.deleteMany({ where }); await p.contact.deleteMany({ where }); await p.contactGroup.deleteMany({ where });
    await p.deviceContact.deleteMany({ where }); await p.mediaAsset.deleteMany({ where }); await p.phone.deleteMany({ where }); await p.user.deleteMany({ where: { id: { in: ids } } });
  }
  console.log('EXACT_SYNTHETIC_FIXTURES_REMOVED', users.length); await p.$disconnect();
});

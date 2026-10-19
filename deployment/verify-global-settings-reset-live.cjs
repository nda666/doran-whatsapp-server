const assert = require('node:assert/strict');
const { randomUUID, randomBytes, createHash, createDecipheriv } = require('node:crypto');
const bcrypt = require('bcrypt');
const { encode } = require('next-auth/jwt');
require('@next/env').loadEnvConfig(process.cwd(), false);
const { PrismaClient } = require('@prisma/client');
const db = new PrismaClient(), base = 'https://dashboard.jeblast.com';
const prefix = 'settings-reset-live-' + randomUUID();
const email = prefix + '@example.invalid';
const settingKey = prefix;
let userId, settingId;
const hash = token => createHash('sha256').update(token).digest('hex');
async function json(url, method, body, token, cookie) {
  const headers = { Origin: base, 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}), ...(cookie ? { Cookie: cookie } : {}) };
  const result = await fetch(base + url, { method, headers, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(25000) });
  return { status: result.status, headers: result.headers, data: await result.json() };
}
async function cookieFor(user) {
  return '__Secure-next-auth.session-token=' + await encode({ token: { id: user.id, token: user.token, email: user.email, sessionVersion: user.sessionVersion }, secret: process.env.NEXTAUTH_SECRET });
}
function decrypt(value) {
  const [version, iv, tag, data] = value.split(':'); assert.equal(version, 'enc-v1');
  const key = createHash('sha256').update('global-settings:' + (process.env.SETTINGS_ENCRYPTION_KEY || process.env.NEXTAUTH_SECRET)).digest();
  const cipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64')); cipher.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([cipher.update(Buffer.from(data, 'base64')), cipher.final()]).toString();
}
(async () => {
  const admin = await db.user.findUniqueOrThrow({ where: { email: 'admin@gmail.com' } });
  for (const [url, text] of [['/signin', 'Lupa password?'], ['/forgot-password', 'Kirim tautan reset'], ['/reset-password', 'RESET PASSWORD']]) {
    const response = await fetch(base + url); assert.equal(response.status, 200, url); assert((await response.text()).includes(text), url + ' missing UI');
  }
  assert.equal((await json('/api/admin/global-settings', 'GET')).status, 401);
  let result = await json('/api/admin/global-settings', 'POST', { label: settingKey, key: '', value: ' clean\u0000\u202e value ' }, admin.token);
  assert.equal(result.status, 201); settingId = result.data.id; assert.equal(result.data.key, settingKey); assert.equal(result.data.value, 'clean value');
  const stored = await db.globalSetting.findUniqueOrThrow({ where: { id: settingId } }); assert(stored.value.startsWith('enc-v1:')); assert.equal(decrypt(stored.value), 'clean value');
  assert.equal((await json('/api/admin/global-settings', 'PATCH', { id: settingId, label: 'Rename', key: 'different-key', value: 'updated' }, admin.token)).status, 409);
  assert.equal((await json('/api/admin/global-settings', 'PATCH', { id: settingId, label: 'Rename', value: 'updated' }, admin.token)).status, 200);
  const oldPassword = 'old123';
  assert.equal((await json('/api/admin/users', 'POST', { name: 'Temporary reset/profile verification', email, password: 'short', role: 'USER', deviceLimit: 100, plan: 'Standard', isActive: true }, admin.token)).status, 400);
  result = await json('/api/admin/users', 'POST', { name: 'Temporary reset/profile verification', email, password: oldPassword, role: 'USER', deviceLimit: 100, plan: 'Standard', isActive: true }, admin.token);
  assert.equal(result.status, 201);
  const user = await db.user.findUniqueOrThrow({ where: { email } }); userId = user.id; assert(await bcrypt.compare(oldPassword, user.password));
  const cookie = await cookieFor(user);
  assert.equal((await json('/api/admin/global-settings', 'GET', undefined, user.token)).status, 403);
  result = await json('/api/profile', 'GET', undefined, undefined, cookie); assert.equal(result.status, 200); assert.equal(result.data.token, user.token); assert(!('password' in result.data));
  assert.equal((await json('/api/profile', 'PATCH', { name: 'Updated profile', email }, undefined, cookie)).status, 200);
  assert.equal((await json('/api/profile', 'PATCH', { name: 'Wrong owner', email, id: admin.id }, undefined, cookie)).status, 400);
  result = await json('/api/admin/users?limit=100&q=' + encodeURIComponent(email), 'GET', undefined, admin.token);
  assert.equal(result.status, 200); assert.equal(result.data.data[0].token, user.token);
  const token = randomBytes(32).toString('hex');
  await db.passwordResetToken.create({ data: { tokenHash: hash(token), userId, email, passwordHash: hash(user.password), sessionVersion: user.sessionVersion, expiresAt: new Date(Date.now() + 60000) } });
  const newPassword = 'new123';
  const resetBody = { token, password: newPassword, passwordConfirm: newPassword };
  assert.equal((await json('/api/reset-password', 'POST', { token, password: 'short', passwordConfirm: 'short' })).status, 400);
  const resets = await Promise.all([json('/api/reset-password', 'POST', resetBody), json('/api/reset-password', 'POST', resetBody)]);
  assert.deepEqual(resets.map(row => row.status).sort(), [200, 400]);
  const updatedUser = await db.user.findUniqueOrThrow({ where: { id: userId } }); assert.equal(updatedUser.sessionVersion, 1); assert(await bcrypt.compare(newPassword, updatedUser.password));
  assert.equal((await json('/api/profile', 'GET', undefined, undefined, cookie)).status, 401);
  assert.equal((await json('/api/reset-password', 'POST', resetBody)).status, 400);
  assert.equal((await json('/api/signin', 'POST', { email, password: oldPassword })).status, 401);
  assert.equal((await json('/api/signin', 'POST', { email, password: newPassword })).status, 200);
  const postmark = await db.globalSetting.findUniqueOrThrow({ where: { key: 'postmark-server-token' } });
  const postmarkToken = decrypt(postmark.value);
  // Read-only verification of the configured provider token and both streams; no live email is sent.
  for (const path of ['/server', '/message-streams/outbound', '/message-streams/broadcast']) {
    const response = await fetch('https://api.postmarkapp.com' + path, { headers: { Accept: 'application/json', 'X-Postmark-Server-Token': postmarkToken }, signal: AbortSignal.timeout(15000) });
    assert.equal(response.status, 200, 'Postmark configuration could not be verified: ' + path);
    const body = await response.json(); if (path.includes('/message-streams/')) assert.equal(body.ID, path.split('/').pop());
  }
  result = await json('/api/forgot-password', 'POST', { email: prefix + '-unknown@example.invalid' }); assert.equal(result.status, 200);
  const page = await fetch(base + '/dashboard/admin?tab=users', { headers: { Cookie: await cookieFor(admin) } }); assert.equal(page.status, 200);
  const html = await page.text();
  const chunks = [...html.matchAll(/<script[^>]*src="([^"]+\.js)"/g)].map(match => match[1]);
  const js = (await Promise.all(chunks.map(async chunk => (await fetch(new URL(chunk, base))).text()))).join('\n');
  for (const label of ['Pengaturan Global', 'Token user', 'Tambah setting', 'Menu akun pengguna', '/dashboard/profile']) assert(js.includes(label), 'Missing deployed feature ' + label);
  console.log('GLOBAL_SETTINGS_RESET_LIVE_OK: public pages, encrypted settings CRUD/immutable keys, owner profile/token, admin user tokens, real concurrent one-time reset, credential change, revoked sessions, Postmark server and both streams verified. No emails sent to users.');
})().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(async () => {
  if (settingId) await db.globalSetting.deleteMany({ where: { id: settingId, key: settingKey } });
  if (userId) await db.user.deleteMany({ where: { id: userId, email } });
  console.log('EXACT_TEMPORARY_SETTINGS_AND_USER_CLEANED'); await db.$disconnect();
});

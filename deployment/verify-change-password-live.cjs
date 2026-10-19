const assert = require('node:assert/strict'), { randomUUID, randomBytes, createHash } = require('node:crypto');
const bcrypt = require('bcrypt'), { encode } = require('next-auth/jwt');
require('@next/env').loadEnvConfig(process.cwd(), false);
const { PrismaClient } = require('@prisma/client'), db = new PrismaClient(), base = 'https://dashboard.jeblast.com';
const email = 'change-password-live-' + randomUUID() + '@example.invalid'; let userId;
async function cookie(user) { return '__Secure-next-auth.session-token=' + await encode({ token: { id: user.id, sessionVersion: user.sessionVersion }, secret: process.env.NEXTAUTH_SECRET }); }
async function request(url, body, session) {
  const response = await fetch(base + url, { method: body ? 'POST' : 'GET', headers: { Origin: base, 'Content-Type': 'application/json', ...(session ? { Cookie: session } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(15000) });
  return { code: response.status, data: await response.json() };
}
(async () => {
  const user = await db.user.create({ data: { name: 'Temporary change password verification', email, password: await bcrypt.hash('old123', 12), token: randomUUID(), role: 'USER', approvalStatus: 'APPROVED', isActive: true } }); userId = user.id;
  const session = await cookie(user), valid = { currentPassword: 'old123', password: 'new123', passwordConfirm: 'new123' };
  assert.equal((await request('/api/change-password', valid)).code, 401);
  assert.equal((await request('/api/change-password', { ...valid, currentPassword: 'wrong1' }, session)).code, 400);
  assert.equal((await request('/api/change-password', { ...valid, password: 'short', passwordConfirm: 'short' }, session)).code, 400);
  assert.equal((await request('/api/change-password', { ...valid, passwordConfirm: 'other1' }, session)).code, 400);
  assert.equal((await request('/api/change-password', { ...valid, id: 'other-user' }, session)).code, 400);
  const resetToken = randomBytes(32).toString('hex');
  await db.passwordResetToken.create({ data: { tokenHash: createHash('sha256').update(resetToken).digest('hex'), userId, email, passwordHash: createHash('sha256').update(user.password).digest('hex'), sessionVersion: 0, expiresAt: new Date(Date.now() + 60000) } });
  const page = await fetch(base + '/dashboard/change-password', { headers: { Cookie: session } }); assert.equal(page.status, 200);
  const html = await page.text(), chunks = [...html.matchAll(/<script[^>]*src="([^"]+\.js)"/g)].map(match => match[1]);
  const js = (await Promise.all(chunks.map(async chunk => { const response = await fetch(new URL(chunk, base)); return response.text(); }))).join('\n');
  for (const label of ['Ganti password', '/dashboard/change-password', 'Password saat ini', 'Konfirmasi password baru']) assert(js.includes(label), label);
  assert.equal((await request('/api/change-password', valid, session)).code, 200);
  const after = await db.user.findUniqueOrThrow({ where: { id: userId } }); assert.equal(after.sessionVersion, 1); assert.equal(after.token, user.token); assert(await bcrypt.compare('new123', after.password));
  assert.equal(await db.passwordResetToken.count({ where: { userId } }), 0);
  assert.equal((await request('/api/profile', undefined, session)).code, 401);
  assert.equal((await request('/api/signin', { email, password: 'old123' })).code, 401);
  assert.equal((await request('/api/signin', { email, password: 'new123' })).code, 200);
  console.log('CHANGE_PASSWORD_LIVE_OK: navbar/page, authenticated own-account password change, wrong current password/short input/mismatch rejected, new login succeeds, old password/session/reset links revoked.');
})().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(async () => {
  if (userId) await db.user.deleteMany({ where: { id: userId, email } });
  console.log('EXACT_CHANGE_PASSWORD_TEST_ACCOUNT_REMOVED'); await db.$disconnect();
});

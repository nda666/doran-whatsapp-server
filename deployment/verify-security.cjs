'use strict';
const assert = require('node:assert/strict');
const { io } = require('socket.io-client');
require('@next/env').loadEnvConfig(require('node:path').resolve(__dirname, '..'), false, { info() {}, error() {} });
const { PrismaClient } = require('@prisma/client');
const { encode } = require('next-auth/jwt');
const db = new PrismaClient();
const base = process.env.VERIFY_URL || 'http://127.0.0.1:3000';
async function request(route, status, options = {}) {
  const r = await fetch(base + route, { ...options, signal: AbortSignal.timeout(10000) });
  assert.equal(r.status, status, route);
  return r;
}
function socketCheck(options, authorized) {
  return new Promise((resolve, reject) => {
    const socket = io(base, { transports: ['websocket'], reconnection: false, timeout: 5000, ...options });
    const timer = setTimeout(() => { socket.close(); reject(new Error('Socket test timeout')); }, 8000);
    const finish = (good, error) => { clearTimeout(timer); socket.close(); good ? resolve() : reject(error); };
    socket.on('connect', () => finish(authorized, new Error('Anonymous socket accepted')));
    socket.on('connect_error', error => finish(!authorized && error.message === 'Unauthorized', error));
  });
}
async function main() {
  await request('/signin', 200);
  await request('/api/signin', 405);
  await request('/api/signin', 400, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  await request('/api/signup', 403, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  await request('/api/test', 404);
  await request('/api/image/whatsapp-auth/creds.json', 401);
  await request('/api/image', 401, { method: 'POST' });
  await request('/api/inbox_message', 401);
  await request('/api/send-attachment', 503, { method: 'POST' });
  const user = await db.user.findFirst({ select: { id: true, token: true } });
  assert.ok(user);
  // Credentials stay in this process and are never printed or saved.
  const headers = { Authorization: 'Bearer ' + user.token, 'Content-Type': 'application/json' };
  await request('/api/image/whatsapp-auth/creds.json', 404, { headers });
  await request('/api/image/downloaded-image/missing.jpg', 404, { headers });
  await request('/api/phones', 401, { headers: { Authorization: 'Bearer invalid' } });
  const inbox = await (await request('/api/inbox_message', 200, { headers })).json();
  assert.ok(inbox.every(x => x.userId === user.id));
  const cookieToken = await encode({ token: { id: user.id }, secret: process.env.NEXTAUTH_SECRET });
  const cookie = '__Secure-next-auth.session-token=' + cookieToken;
  await request('/api/image/whatsapp-auth/creds.json', 404, { headers: { Cookie: cookie } });
  await request('/api/phones', 403, { method: 'POST', headers: { Cookie: cookie, Origin: 'https://invalid.example', 'Content-Type': 'application/json' }, body: '{}' });
  await socketCheck({}, false);
  await socketCheck({ auth: { token: user.token }, query: { userId: 'untrusted-room' } }, true);
  await socketCheck({ extraHeaders: { Cookie: cookie } }, true);
  const previews = require('../dist/src/server/utils/safeLinkPreview');
  for (const ip of ['127.0.0.1', '10.1.2.3', '169.254.169.254', '::1', '::ffff:127.0.0.1', 'fc00::1', '2001:db8::1']) assert.equal(previews.isPublicAddress(ip), false);
  assert.equal(await previews.safeLinkPreview('http://127.0.0.1'), undefined);
  assert.equal(await previews.safeLinkPreview('https://example.com:3000'), undefined);
  assert.ok((await previews.safeLinkPreview('https://example.com'))?.title);
  console.log('SECURITY_HTTP_COOKIE_SOCKET_AND_SAFE_PREVIEW_TESTS_OK');
}
main().then(() => db.$disconnect()).catch(async error => { console.error(error.message); await db.$disconnect(); process.exitCode = 1; });

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
require('@next/env').loadEnvConfig(process.cwd());
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient(), base = 'http://127.0.0.1:3018';
const prefix = 'media-original-check-' + randomUUID();
const users = [], assets = [];
assert.equal(process.env.WHATSAPP_ENABLED, 'false');
async function request(asset, user, method, body) {
  const response = await fetch(base + '/api/media/' + asset.id, { method, headers: { Authorization: 'Bearer ' + user.token, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
  return response;
}
(async () => {
  for (const suffix of ['a', 'b']) users.push(await p.user.create({ data: { email: `${prefix}-${suffix}@example.invalid`, name: prefix, password: 'Disabled fixture ' + randomUUID(), token: randomUUID(), approvalStatus: 'APPROVED' } }));
  const directory = path.join(process.cwd(), 'storage/campaign-media');
  await fs.mkdir(directory, { recursive: true });
  for (const originalName of [null, 'uploaded-original.txt']) {
    const filename = randomUUID() + '.txt';
    const asset = await p.mediaAsset.create({ data: { userId: users[0].id, name: originalName ? 'Initial label' : 'legacy-original.txt', originalName, filename, mime: 'text/plain', size: 12 } });
    assets.push(asset); await fs.writeFile(path.join(directory, filename), 'fixture only');
    const expected = originalName || asset.name;
    assert.equal((await request(asset, users[1], 'PATCH', { name: 'Forbidden' })).status, 404);
    assert.equal((await request(asset, users[0], 'PATCH', { name: '' })).status, 400);
    const updates = await Promise.all(['Label one', 'Label two'].map(name => request(asset, users[0], 'PATCH', { name, originalName: 'do-not-overwrite.txt' })));
    assert(updates.every(response => response.status === 200));
    assert.equal((await request(asset, users[0], 'PATCH', { name: 'Final label' })).status, 200);
    const saved = await p.mediaAsset.findUniqueOrThrow({ where: { id: asset.id } });
    assert.equal(saved.name, 'Final label'); assert.equal(saved.originalName, expected); assert.equal(saved.filename, filename);
    const downloaded = await request(asset, users[0], 'GET');
    assert.equal(downloaded.status, 200); assert(downloaded.headers.get('content-disposition').includes(encodeURIComponent(expected))); assert.equal(await downloaded.text(), 'fixture only');
    const { loadAssetContent } = require('../dist/src/server/campaigns/media.js');
    const content = await loadAssetContent(saved, users[0].id, 'Caption');
    assert.equal(content.fileName, expected); assert.equal(content.document.toString(), 'fixture only');
    console.log(originalName ? 'NEW_MEDIA_LABEL_ORIGINAL_DOWNLOAD_DOCUMENT_NAME_STABLE_OK' : 'LEGACY_MEDIA_CONCURRENT_LABEL_EDIT_FREEZES_ORIGINAL_NAME_OK');
  }
})().catch(error => { console.error(error.stack); process.exitCode = 1; }).finally(async () => {
  for (const asset of assets) {
    await p.mediaAsset.deleteMany({ where: { id: asset.id, userId: users[0].id } });
    await fs.unlink(path.join(process.cwd(), 'storage/campaign-media', asset.filename)).catch(() => {});
  }
  for (const user of users) { assert(user.email.startsWith(prefix)); await p.user.deleteMany({ where: { id: user.id, email: user.email } }); }
  await p.$disconnect(); console.log('ISOLATED_FIXTURES_REMOVED_NO_MESSAGES_SENT');
});

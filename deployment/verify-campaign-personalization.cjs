'use strict';
// Local, synthetic tests only: no environment files, database, HTTP, or WhatsApp.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const { randomUUID } = require('node:crypto');
const ts = require('typescript');
const root = path.resolve(__dirname, '..'), cache = new Map();
const state = { campaign: null, jobs: [], writes: 0 };
const tx = {
  $queryRaw: async () => [],
  campaign: {
    findUnique: async () => state.campaign,
    findUniqueOrThrow: async () => state.campaign,
    create: async ({ data }) => { state.writes++; return state.campaign = { ...data, status: 'WAITING' }; },
    update: async ({ data }) => { state.writes++; return state.campaign = { ...state.campaign, ...data }; },
  },
  waDispatch: {
    count: async () => 0,
    findMany: async () => state.jobs,
    deleteMany: async () => { state.writes++; state.jobs = []; },
  },
  waSenderLease: { createMany: async () => {} },
};
const stubs = {
  'src/lib/prisma.ts': { prisma: {
    $transaction: async fn => fn(tx), campaign: { findFirst: async () => state.campaign },
    phone: { findMany: async () => [{ id: phoneId }] },
    contact: { findMany: async () => [], count: async () => 0 },
    contactGroup: { count: async () => 0 },
  } },
  'src/lib/access.ts': { ownerScope: () => ({ userId: 'owner' }) },
  'src/middleware/apiAuthMiddleware.ts': { __esModule: true, default: handler => handler },
  'src/server/dispatchWebhook/events.ts': { createDispatches: async (_, { data }) => { state.writes++; state.jobs.push(...data); } },
  'src/server/dispatch/settings.ts': {},
};
function load(name) {
  if (stubs[name]) return stubs[name];
  if (cache.has(name)) return cache.get(name);
  const file = path.join(root, name), real = createRequire(file), module = { exports: {} };
  cache.set(name, module.exports);
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: 1, target: 7, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  const req = spec => {
    if (!spec.startsWith('.') && !spec.startsWith('@/')) return real(spec);
    const resolved = spec.startsWith('@/') ? 'src/' + spec.slice(2) : path.posix.normalize(path.posix.join(path.posix.dirname(name), spec));
    const target = ['.ts', '.tsx'].map(ext => resolved + ext).find(candidate => fs.existsSync(path.join(root, candidate)));
    return load(target);
  };
  new Function('require', 'module', 'exports', code)(req, module, module.exports);
  cache.set(name, module.exports); return module.exports;
}
const phoneId = randomUUID();
const { campaignInput, campaignJobs } = load('src/server/campaigns/prepare.ts');
const { parseCampaignRows, renderCampaignMessage, mergeCampaignRecipients, campaignDataSchema } = load('src/lib/campaignPersonalization.ts');
const { parseCsv } = load('src/server/campaigns/csv.ts');
const { campaignRecipientsCsv, readCampaignRecipientCsv, default: RecipientData } = load('src/components/CampaignRecipientData.tsx');
const template = 'Halo {nama} ({nomor}), invoice {no_invoice}: {nominal}, produk {nama_produk}.';
const recipients = parseCampaignRows(parseCsv(fs.readFileSync(path.join(root, 'public/templates/campaign-personalisasi.csv'), 'utf8')));
const input = extra => campaignInput.parse({ id: randomUUID(), name: 'Synthetic', phoneIds: [phoneId], message: template, recipients, ...extra });
const expectError = (fn, pattern) => assert.throws(fn, pattern);

(async () => {
  assert.equal(recipients.length, 2);
  assert.equal(renderCampaignMessage(template, recipients[0]), 'Halo Budi (6281234567890), invoice INV-001: Rp 150.000, produk Headset.');
  assert.equal(renderCampaignMessage('{nama}/{nomor}', { number: '081234567890', name: '' }), '6281234567890/6281234567890');
  assert.equal(renderCampaignMessage('{x} {nama}', { number: recipients[0].number, name: '{nomor}', data: { x: '$& {nama} "a,b"\nnext' } }), '$& {nama} "a,b"\nnext {nomor}');
  expectError(() => renderCampaignMessage('{unknown}', recipients[0]), /unknown.*belum diisi/);
  expectError(() => renderCampaignMessage('{x}', { ...recipients[0], data: { x: ' ' } }), /belum diisi/);
  expectError(() => renderCampaignMessage('{constructor}', recipients[0]), /belum diisi/);
  expectError(() => renderCampaignMessage('{x}'.repeat(6), { ...recipients[0], data: { x: 'a'.repeat(2000) } }), /10.000/);
  for (const key of ['Nama', 'bad-key', 'nomor', 'nama', 'constructor', 'prototype', '__proto__']) {
    assert.equal(campaignDataSchema.safeParse(Object.fromEntries([[key, 'x']])).success, false, key);
  }
  assert.equal(campaignDataSchema.safeParse(Object.fromEntries(Array.from({ length: 31 }, (_, i) => ['key' + i, 'x']))).success, false);
  assert.equal(campaignDataSchema.safeParse({ x: 'a'.repeat(2001) }).success, false);
  assert.equal(campaignInput.safeParse({ ...input(), recipients: [{ ...recipients[0], data: { x: 42 } }] }).success, false);
  const special = [{ number: '6281234567890', name: 'Budi, "A"', data: { kode: '000123', catatan: 'baris 1\nbaris 2', nominal: '0', literal: '=SUM(A1)' } }];
  assert.deepEqual(readCampaignRecipientCsv(campaignRecipientsCsv(special)), special, 'editing round-trip preserves data exactly');
  assert.deepEqual(parseCampaignRows([[' Nomor ', 'Nama', 'No Invoice', 'Nama-Produk'], ['081234567890', 'Budi', '0001', 'Headset']])[0].data, { no_invoice: '0001', nama_produk: 'Headset' });
  assert.equal(parseCampaignRows([['nomor', 'qty'], ['081234567890', 0]])[0].data.qty, '0');
  expectError(() => parseCampaignRows([['nama'], ['Budi']]), /Header wajib/);
  expectError(() => parseCampaignRows([['nomor', 'No Invoice', 'no_invoice'], ['081234567890', 'a', 'b']]), /duplikat/);
  expectError(() => parseCampaignRows([['nomor', ''], ['081234567890', 'a']]), /kosong/);
  expectError(() => parseCampaignRows([['nomor'], ['081234567890', 'extra']]), /tanpa header/);
  expectError(() => parseCampaignRows([['nomor', 'tanggal'], ['081234567890', new Date()]]), /tanggal sebagai teks/);
  expectError(() => parseCampaignRows([['nomor'], ['invalid']]), /Baris 2/);
  expectError(() => parseCampaignRows([['nomor'], ['081234567890'], ['+6281234567890']]), /duplikat/);
  expectError(() => parseCampaignRows([['nomor'], ...Array.from({ length: 10001 }, () => ['081234567890'])]), /10.000/);
  expectError(() => readCampaignRecipientCsv('nomor,nama\n"unclosed'), /Kutip/);
  expectError(() => readCampaignRecipientCsv('a'.repeat(3_000_001)), /3 MB/);
  const contacts = [{ number: recipients[0].number, name: 'Phonebook' }];
  assert.equal(mergeCampaignRecipients(contacts, recipients).length, 2);
  expectError(() => mergeCampaignRecipients([], [recipients[0], { ...recipients[0], number: '081234567890' }]), /duplikat/);
  assert.equal(mergeCampaignRecipients([], [{ number: recipients[0].number, name: 'Old' }, { number: '081234567890', name: 'New' }])[0].name, 'New', 'legacy duplicate behavior');
  const jobs = campaignJobs(input(), 'owner', contacts);
  assert.equal(jobs.length, 2);
  assert(jobs[0].message.includes('INV-001') && jobs[1].message.includes('INV-002'));
  assert.equal(jobs[0].payloadHash, campaignJobs(input(), 'owner', contacts)[0].payloadHash, 'stable retry hash');
  assert.notEqual(jobs[0].payloadHash, campaignJobs(input({ recipients: [{ ...recipients[0], data: { ...recipients[0].data, no_invoice: 'CHANGED' } }, recipients[1]] }), 'owner', contacts)[0].payloadHash);
  expectError(() => campaignJobs(input(), 'owner', [...contacts, { number: '628145678901', name: 'Missing data' }]), /belum diisi/);
  const legacy = campaignJobs(input({ message: 'Halo {nama} {nomor}', recipients: [{ number: '081234567890', name: 'Budi' }] }), 'owner', []);
  assert.equal(legacy[0].message, 'Halo Budi 6281234567890');
  const sticker = campaignJobs(input({ messageType: 'sticker', message: '', mediaId: randomUUID() }), 'owner', []);
  assert.equal(sticker[0].message, ''); assert.equal(sticker[0].payload.kind, 'sticker');

  // Execute the real create/edit routes with an in-memory repository and mocked auth.
  process.env.DISPATCH_QUEUE_ENABLED = 'true';
  const create = load('src/pages/api/campaigns/index.ts').default;
  const edit = load('src/pages/api/campaigns/[id].ts').default;
  const invoke = async (handler, method, body) => {
    const response = { code: 200, setHeader() {}, status(code) { this.code = code; return this; }, json(data) { this.data = data; return this; }, end() { return this; } };
    await handler({ method, body, query: { id: state.campaign?.id }, user: { id: 'owner' } }, response); return response;
  };
  const body = input();
  assert.equal((await invoke(create, 'POST', body)).code, 201);
  assert.deepEqual(state.campaign.audience.recipients, recipients);
  assert.equal((await invoke(create, 'POST', body)).code, 201, 'idempotent retry');
  assert.equal(state.jobs.length, 2);
  const edited = { ...body, action: 'edit', recipients: recipients.map(row => ({ ...row, data: { ...row.data, no_invoice: 'EDIT-' + row.data.no_invoice } })) };
  assert.equal((await invoke(edit, 'PATCH', edited)).code, 200);
  assert(state.jobs.every(job => job.message.includes('EDIT-INV-')));
  assert.equal(state.campaign.audience.recipients[0].data.no_invoice, 'EDIT-INV-001');
  const before = state.writes;
  assert.equal((await invoke(edit, 'PATCH', { ...edited, message: '{missing}' })).code, 409);
  assert.equal((await invoke(create, 'POST', { ...body, id: randomUUID(), message: '{missing}' })).code, 400);
  assert.equal((await invoke(create, 'POST', { ...body, recipients: [{ ...recipients[0], data: { nomor: 'override' } }] })).code, 400);
  assert.equal(state.writes, before, 'invalid personalization never mutates campaign/queue');
  const React = require('react'), { renderToStaticMarkup } = require('react-dom/server');
  const html = renderToStaticMarkup(React.createElement(RecipientData, { value: campaignRecipientsCsv(recipients), template }));
  for (const text of ['Pratinjau pesan', 'INV-001', 'Rp 150.000', 'no_invoice', 'Import data CSV / Excel']) assert(html.includes(text), text);
  const errorHtml = renderToStaticMarkup(React.createElement(RecipientData, { value: campaignRecipientsCsv(recipients), template: '{missing}' }));
  assert(errorHtml.includes('belum diisi'));
  console.log('CAMPAIGN_PERSONALIZATION_PASSED: CSV/Excel row parsing, rendering, boundaries, literal values, legacy/sticker compatibility, create/edit persistence, idempotency, rejection before mutation, UI SSR; no external services or real messages.');
})().catch(error => { console.error(error); process.exitCode = 1; });

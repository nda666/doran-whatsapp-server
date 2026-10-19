"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const { Readable } = require("node:stream");
const Module = require("node:module");
const { randomUUID } = require("node:crypto");
const sharp = require("sharp");
require("ts-node").register({ project: "tsconfig.server.json", transpileOnly: true });
require("tsconfig-paths").register({ baseUrl: process.cwd(), paths: { "@/*": ["src/*"] } });

async function main() {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "jeblast-sticker-test-"));
  const assets = [];
  let failSave = false;
  const tx = { $queryRaw: async () => [], mediaAsset: {
    count: async () => assets.length,
    create: async ({ data }) => { if (failSave) throw new Error("database unavailable"); const asset = { id: randomUUID(), ...data }; assets.push(asset); return asset; },
  } };
  const database = { ...tx, $transaction: callback => callback(tx), phone: { findFirst: async ({ where }) => {
    const userId = { "own-phone": "test-owner", "other-phone": "other-owner" }[where.id];
    return userId && (!where.userId || where.userId === userId) ? { userId } : null;
  } } };
  let actor = { id: "test-owner", email: "test@example.com", role: "USER", approvalStatus: "APPROVED", isActive: true };
  const load = Module._load;
  Module._load = function(request, ...args) {
    if (request === "@/middleware/apiAuthMiddleware") return { __esModule: true, default: handler => handler };
    if (request === "@/lib/prisma") return { prisma: database };
    if (request === "@/server/campaigns/media") return { mediaDirectory: () => directory };
    return load.call(this, request, ...args);
  };
  let handler;
  try { handler = require("../src/pages/api/media/index").default; } finally { Module._load = load; }
  try {
    const source = await sharp({ create: { width: 900, height: 600, channels: 3, background: "green" } }).jpeg().toBuffer();
    async function upload(files, sticker = true, labels = true, query = {}) {
      const body = new FormData();
      for (const file of files) body.append("file", new Blob([file.buffer], { type: file.mime || "image/jpeg" }), file.name || "photo.jpg");
      if (labels) body.append("labels", JSON.stringify(files.map((_, i) => `Foto ${i + 1}`)));
      if (sticker) body.append("asSticker", "1");
      const encoded = new Request("http://localhost/api/media", { method: "POST", body });
      const bytes = Buffer.from(await encoded.arrayBuffer());
      const req = Readable.from([bytes]);
      req.headers = { "content-type": encoded.headers.get("content-type"), "content-length": String(bytes.length) };
      req.method = "POST";
      req.query = query;
      req.user = actor;
      const response = { status: 200 };
      const res = { setHeader() {}, status(code) { response.status = code; return this; }, json(data) { response.data = data; return this; } };
      await handler(req, res);
      return response;
    }
    const converted = await upload([{ buffer: source }]);
    assert.equal(converted.status, 201);
    const asset = assets[0];
    assert.equal(asset.mime, "image/webp"); assert.equal(asset.userId, "test-owner");
    assert.equal(asset.originalName, "photo.webp"); assert.equal(asset.name, "Foto 1");
    assert.ok(asset.size <= 102400);
    const output = await fs.readFile(path.join(directory, asset.filename));
    assert.equal((await sharp(output).metadata()).width, 512);
    assert.equal((await fs.readdir(directory)).length, 1, "original temporary photo removed");
    const normal = await upload([{ buffer: source }], false, false);
    assert.equal(normal.status, 201); assert.equal(normal.data.mime, "image/jpeg", "legacy API response retained");
    assert.deepEqual(await fs.readFile(path.join(directory, assets[1].filename)), source);
    const before = (await fs.readdir(directory)).sort();
    const invalid = await upload([{ buffer: source }, { buffer: Buffer.from("corrupt image") }]);
    assert.equal(invalid.status, 400); assert.equal(assets.length, 2);
    assert.deepEqual((await fs.readdir(directory)).sort(), before, "mixed failed batch removes originals and conversions");
    const unsupported = await upload([{ buffer: Buffer.from("hello"), mime: "text/plain", name: "text.txt" }]);
    assert.equal(unsupported.status, 400);
    failSave = true;
    assert.equal((await upload([{ buffer: source }])).status, 400);
    assert.deepEqual((await fs.readdir(directory)).sort(), before, "database failure cleans converted assets");
    failSave = false;
    assert.equal((await upload([{ buffer: source }], true, true, { phoneId: "other-phone" })).status, 404, "users cannot upload for another owner's device");
    assert.equal((await upload([{ buffer: source }], true, true, { phoneId: ["own-phone"] })).status, 400);
    assert.equal((await upload([{ buffer: source }], true, true, { phoneId: "own-phone" })).status, 201);
    assert.equal(assets[2].userId, "test-owner");
    actor = { ...actor, id: "admin-id", email: "admin@gmail.com", role: "ADMIN" };
    assert.equal((await upload([{ buffer: source }], true, true, { phoneId: "other-phone" })).status, 201);
    assert.equal(assets[3].userId, "other-owner", "admin test upload belongs to sender's owner");
    console.log("PASS: multipart conversion, saved WebP, labels, original cleanup, legacy upload, corrupt/mixed batch rollback, database failure cleanup, Test Kirim owner scoping");
  } finally {
    assert.ok(path.resolve(directory).startsWith(path.resolve(os.tmpdir()) + path.sep) && path.basename(directory).startsWith("jeblast-sticker-test-"));
    await fs.rm(directory, { recursive: true, force: true });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });

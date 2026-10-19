"use strict";
// No external services, database, or WhatsApp sends.
const assert = require("node:assert/strict");
const { randomUUID, createHash, randomBytes } = require("node:crypto");
const sharp = require("sharp");
require("ts-node").register({ project: "tsconfig.server.json", transpileOnly: true });
const { photoToSticker } = require("../src/server/campaigns/sticker");
const { campaignInput, campaignJobs, validCampaignMedia } = require("../src/server/campaigns/prepare");

async function main() {
  const source = await sharp({ create: { width: 800, height: 400, channels: 4, background: "red" } }).png().toBuffer();
  const result = await photoToSticker(source);
  const metadata = await sharp(result).metadata();
  assert.equal(metadata.format, "webp");
  assert.equal(metadata.width, 512); assert.equal(metadata.height, 512);
  assert.ok(result.length <= 100 * 1024);
  const { data, info } = await sharp(result).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  assert.equal(data[3], 0, "transparent padding preserves full photo");
  assert.ok(data[(256 * info.width + 256) * 4] > 200, "photo remains centered");
  const noise = await sharp(randomBytes(1024 * 1024 * 3), { raw: { width: 1024, height: 1024, channels: 3 } }).jpeg().toBuffer();
  assert.ok((await photoToSticker(noise)).length <= 100 * 1024, "complex photo respects size limit");
  const rotated = await sharp(source).jpeg().withMetadata({ orientation: 6 }).toBuffer();
  const rotatedPixels = await sharp(await photoToSticker(rotated)).ensureAlpha().raw().toBuffer();
  assert.equal(rotatedPixels[(256 * 512) * 4 + 3], 0, "EXIF rotation applied before padding");
  await assert.rejects(photoToSticker(Buffer.from("not a photo")));
  await assert.rejects(photoToSticker(Buffer.from('<svg width="10" height="10"></svg>')));
  const animated = await sharp(Buffer.concat([Buffer.alloc(10 * 10 * 3, 0), Buffer.alloc(10 * 10 * 3, 255)]), { raw: { width: 10, height: 20, channels: 3, pageHeight: 10 } }).webp({ loop: 0, delay: [100, 100] }).toBuffer();
  await assert.rejects(photoToSticker(animated), /statis/);

  const owner = randomUUID(), mediaId = randomUUID();
  const base = { id: randomUUID(), name: "Sticker campaign", phoneIds: [randomUUID(), randomUUID()], mediaId,
    recipients: [{ number: "081234567890", name: "Budi" }, { number: "081234567891", name: "Sari" }] };
  const input = campaignInput.parse({ ...base, messageType: "sticker" });
  const jobs = campaignJobs(input, owner, []);
  assert.equal(jobs.length, 2);
  for (const job of jobs) { assert.equal(job.mediaId, mediaId); assert.deepEqual(job.payload, { kind: "sticker" }); assert.equal(job.message, ""); }
  assert.notEqual(jobs[0].phoneId, jobs[1].phoneId);
  assert.equal(jobs[0].payloadHash, jobs[1].payloadHash);
  const old = campaignJobs(campaignInput.parse({ ...base, message: "Halo {nama}" }), owner, []);
  assert.equal(old[0].message, "Halo Budi"); assert.equal(old[0].payload, undefined);
  assert.equal(old[0].payloadHash, createHash("sha256").update(JSON.stringify(["Halo Budi", mediaId])).digest("hex"), "existing campaign retry hashes unchanged");
  assert.notEqual(old[0].payloadHash, jobs[0].payloadHash);
  assert.equal(campaignInput.safeParse({ ...base, messageType: "sticker", mediaId: null }).success, false);
  assert.equal(campaignInput.safeParse({ ...base, messageType: "sticker", message: "ignored caption" }).success, false);
  assert.equal(campaignInput.safeParse(base).success, false, "normal messages still require text");
  assert.ok(validCampaignMedia(input, { mime: "image/webp", size: result.length, userId: owner }, owner));
  for (const media of [null, { mime: "image/jpeg", size: 100, userId: owner }, { mime: "image/webp", size: 102401, userId: owner }, { mime: "image/webp", size: 100, userId: randomUUID() }]) {
    assert.equal(validCampaignMedia(input, media, owner), false);
  }
  console.log("PASS: conversion, size, transparency, rotation, invalid/animated input, sticker queue, ownership, legacy campaign compatibility");
}
main().catch(error => { console.error(error); process.exitCode = 1; });

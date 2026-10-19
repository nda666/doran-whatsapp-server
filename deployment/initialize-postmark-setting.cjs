'use strict';
// Run after prisma migrate deploy; the supplied token lives only in the ignored environment file.
const path = require('node:path');
require('@next/env').loadEnvConfig(path.resolve(__dirname, '..'), process.env.NODE_ENV !== 'production');
const { PrismaClient } = require('@prisma/client');
const { createCipheriv, createHash, randomBytes } = require('node:crypto');
const db = new PrismaClient();
(async () => {
  const token = process.env.POSTMARK_SERVER_TOKEN;
  const secret = process.env.SETTINGS_ENCRYPTION_KEY || process.env.NEXTAUTH_SECRET;
  if (!token || !secret) throw new Error('POSTMARK_SERVER_TOKEN and settings encryption configuration are required');
  const key = createHash('sha256').update(`global-settings:${secret}`).digest();
  const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(token.trim(), 'utf8'), cipher.final()]);
  const value = ['enc-v1', iv.toString('base64'), cipher.getAuthTag().toString('base64'), encrypted.toString('base64')].join(':');
  await db.globalSetting.upsert({ where: { key: 'postmark-server-token' },
    create: { key: 'postmark-server-token', label: 'Postmark Server Token', value }, update: {} });
  console.log('Postmark setting initialized; existing value preserved.');
})().catch(() => { console.error('Postmark setting initialization failed. Check database/migrations and private environment configuration.'); process.exitCode = 1; })
  .finally(() => db.$disconnect());

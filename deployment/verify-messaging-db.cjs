'use strict';
// Exercise real MySQL row locks using isolated synthetic identifiers; never send messages.
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
require('@next/env').loadEnvConfig(root);
require('ts-node').register({ project: path.join(root, 'tsconfig.server.json'), transpileOnly: true });
require('tsconfig-paths').register({ baseUrl: root, paths: { '@/*': ['./src/*'] } });
const { prisma } = require('../src/lib/prisma.ts');
const { reserveSend, captureStop, usageDay } = require('../src/server/messaging/safety.ts');
const userId = randomUUID(), phoneId = randomUUID();
(async () => {
  try {
    await prisma.messagingPreference.create({ data: { userId, optOutEnabled: true } });
    assert.equal(await captureStop(userId, '6280000000000@s.whatsapp.net', 'STOP'), true);
    await assert.rejects(reserveSend(userId, phoneId, '6280000000000@s.whatsapp.net'), error => error.code === 'RECIPIENT_OPTED_OUT');
    await prisma.deviceSendPolicy.create({ data: { phoneId, dailyLimit: 1, useGlobalQuota: false, minIntervalSeconds: null } });
    const outcomes = await Promise.allSettled(Array.from({ length: 20 }, () => reserveSend(userId, phoneId, '6280000000001@s.whatsapp.net')));
    assert.equal(outcomes.filter(r => r.status === 'fulfilled').length, 1);
    outcomes.filter(r => r.status === 'rejected').forEach(r => assert.equal(r.reason.code, 'DEVICE_DAILY_LIMIT'));
    assert.equal((await prisma.deviceDailyUsage.findUniqueOrThrow({ where: { phoneId_day: { phoneId, day: usageDay() } } })).attempts, 1);
    console.log('MYSQL_MESSAGING_PASSED: suppression and concurrent quota admission; synthetic identifiers only.');
  } finally {
    await prisma.recipientSuppression.deleteMany({ where: { userId } });
    await prisma.messagingPreference.deleteMany({ where: { userId } });
    await prisma.deviceDailyUsage.deleteMany({ where: { phoneId } });
    await prisma.deviceSendPolicy.deleteMany({ where: { phoneId } });
    await prisma.$disconnect();
  }
})().catch(error => { console.error('MYSQL_MESSAGING_FAILED', error.code || error.name); process.exitCode = 1; });

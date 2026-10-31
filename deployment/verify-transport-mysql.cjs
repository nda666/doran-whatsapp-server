'use strict';
// Explicit read-only deployment preflight, not included in the offline CI suite.
const assert = require('node:assert/strict');
const fs = require('node:fs');
require('@next/env').loadEnvConfig(process.cwd(), false, { info() {}, error() {} });
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
(async () => {
  const source = fs.readFileSync('src/server/dispatch/worker.ts', 'utf8');
  const template = source.split('return prisma.$queryRaw<QueueSample[]>`')[1]?.split('`;')[0];
  assert(template && /^\s*SELECT\s/.test(template), 'Only the monitoring SELECT may be tested');
  const values = [];
  const query = template.replace(/\$\{(cutoff|new Date\(\))\}/g, (_, value) => {
    values.push(value === 'cutoff' ? new Date(Date.now() - 86400000) : new Date()); return '?';
  });
  assert(!query.includes('${') && !query.includes(';'));
  const rows = await prisma.$queryRawUnsafe(query + ' LIMIT 10', ...values);
  for (const row of rows) {
    assert(row.oldest instanceof Date && row.nextDue instanceof Date);
    assert(row.readyAt instanceof Date, 'MySQL computed readiness must deserialize to Date');
  }
  console.log('TRANSPORT_HEALTH_MYSQL_SELECT_PASSED', JSON.stringify({ sampledSenders: rows.length, readOnly: true }));
})().catch(error => { console.error(error.code || error.name, error.message?.slice(0, 160)); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());

'use strict';
// Explicitly approved additive upgrades only. No migrate deploy/resolve, data
// mutation of existing rows, migration-history writes, or arbitrary SQL from a deployment diff.
// Quota initialization only copies current usage into a newly created quota table.
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const approved = {
  '20261025000000_phone_assignment': '48321c65079283d60b499b34f1a33448d2affce51021421701be93323fa161a4',
  '20261024070000_device_channel': '017656197c5f06f58930d06f739585364bda52ec2a746c35b45b2995c3ec71eb',
  '20261021100000_device_quota_reset_override': '631199dee16c982ffd78a032ff59fc2d34130e0fe0b8e0be0a616806cd29bb0a',
  '20261021090000_device_quota_reset': '0c7abc9ac2f9f201fc6029233fcf4769a979f622fbb4749dd0ee43ebac381e02',
  '20261020030000_sender_groups': '4f9613fe539447a90cbf22c39005fa1ae10aadd66bd0fb9dc18679cdf6adfcf3',
  '20261020040000_operating_hours': '239a206e4f4c025c54626593dead34cb4e80da12ced89d75eb2b5db99dcccf22',
};
const normalize = sql => sql.replace(/`/g, '').replace(/\s+/g, ' ').replace(/\s*([(),])\s*/g, '$1').trim().toLowerCase();
const statements = sql => sql.replace(/^\s*--[^\n]*$/gm, '').split(';').map(s => s.trim()).filter(Boolean);
function actions(value) {
  let depth = 0, start = 0;
  const parts = [];
  for (let i = 0; i < value.length; i++) {
    if (value[i] === '(') depth++;
    if (value[i] === ')') depth--;
    if (value[i] === ',' && depth === 0) { parts.push(value.slice(start, i).trim()); start = i + 1; }
  }
  parts.push(value.slice(start).trim()); return parts;
}
function operations(root = path.resolve(__dirname, '..')) {
  const result = [];
  for (const [name, checksum] of Object.entries(approved)) {
    const source = fs.readFileSync(path.join(root, 'prisma/migrations', name, 'migration.sql'), 'utf8').replace(/\r\n/g, '\n');
    if (createHash('sha256').update(source).digest('hex') !== checksum) throw Error('Approved migration checksum changed');
    for (const sql of statements(source)) {
      const table = /^CREATE TABLE `([a-zA-Z0-9_]+)`\s*\(/.exec(sql);
      if (table) {
        result.push({ kind: 'table', table: table[1], name: table[1], sql });
        for (const item of actions(sql.slice(sql.indexOf('(') + 1, sql.lastIndexOf(')')))) {
          const embedded = /^(CONSTRAINT|(?:UNIQUE )?INDEX) `([a-zA-Z0-9_]+)`\s/.exec(item);
          if (embedded) result.push({ kind: embedded[1] === 'CONSTRAINT' ? 'constraint' : 'index', table: table[1], name: embedded[2], action: `ADD ${item}`, sql: `ALTER TABLE \`${table[1]}\` ADD ${item}` });
        }
        continue;
      }
      if (name === '20261021090000_device_quota_reset' && /^INSERT INTO `device_quota_windows` /.test(sql)) {
        const table = result.find(op => op.kind === 'table' && op.table === 'device_quota_windows');
        if (!table) throw Error('Quota seed requires its new table');
        table.seedSql = sql;
        continue;
      }
      const index = /^CREATE INDEX `([a-zA-Z0-9_]+)` ON `([a-zA-Z0-9_]+)`\s*(\([\s\S]+\))$/.exec(sql);
      if (index) {
        const action = `ADD INDEX \`${index[1]}\` ${index[3]}`;
        result.push({ kind: 'index', table: index[2], name: index[1], action, sql: `ALTER TABLE \`${index[2]}\` ${action}` });
        continue;
      }
      const alter = /^ALTER TABLE `([a-zA-Z0-9_]+)`\s+([\s\S]+)$/.exec(sql);
      if (!alter) throw Error('Only approved additive DDL is supported');
      for (const action of actions(alter[2])) {
        const match = /^ADD (COLUMN|INDEX|CONSTRAINT) `([a-zA-Z0-9_]+)`\s/.exec(action);
        if (!match) throw Error('Non-additive schema action rejected');
        result.push({ kind: { COLUMN: 'column', INDEX: 'index', CONSTRAINT: 'constraint' }[match[1]],
          table: alter[1], name: match[2], action, sql: `ALTER TABLE \`${alter[1]}\` ${action}` });
      }
    }
  }
  return result;
}
function validateDiff(diff, ops = operations()) {
  const allowed = new Set(ops.filter(op => op.action).map(op => normalize(op.sql)));
  for (const sql of statements(diff)) {
    const table = /^CREATE TABLE `([a-zA-Z0-9_]+)`\s*\(/.exec(sql);
    if (table && ops.some(op => op.kind === 'table' && op.table === table[1])) continue;
    const alter = /^ALTER TABLE `([a-zA-Z0-9_]+)`\s+([\s\S]+)$/.exec(sql);
    if (alter && actions(alter[2]).every(action => allowed.has(normalize(`ALTER TABLE \`${alter[1]}\` ${action}`)))) continue;
    const index = /^CREATE (UNIQUE )?INDEX `([a-zA-Z0-9_]+)` ON `([a-zA-Z0-9_]+)`\s*(\([\s\S]+\))$/.exec(sql);
    if (index && allowed.has(normalize(`ALTER TABLE \`${index[3]}\` ADD ${index[1] || ''}INDEX \`${index[2]}\` ${index[4]}`))) continue;
    throw Error('Schema drift outside the approved additive migrations');
  }
}
async function exists(db, op) {
  const query = {
    table: () => db.$queryRaw`SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ${op.table}`,
    column: () => db.$queryRaw`SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ${op.table} AND COLUMN_NAME = ${op.name}`,
    index: () => db.$queryRaw`SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ${op.table} AND INDEX_NAME = ${op.name}`,
    constraint: () => db.$queryRaw`SELECT 1 FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ${op.table} AND CONSTRAINT_NAME = ${op.name}`,
  }[op.kind];
  return (await query()).length > 0;
}
async function plan(db, diff) {
  const ops = operations(); validateDiff(diff, ops);
  const pending = [];
  for (const op of ops) if (!await exists(db, op)) pending.push(op);
  return pending;
}
function requireBackups(directory) {
  for (const name of ['database.sql', 'storage-and-env.tar']) {
    const stat = fs.lstatSync(path.join(directory, name));
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size === 0) throw Error('Completed private database and storage backups required');
  }
}
async function apply(db, diff, backup) {
  requireBackups(backup);
  const pending = await plan(db, diff);
  const result = { approved_migrations: Object.keys(approved), executed: [], created_tables: [], created_table_counts: {}, history_updated: false };
  const record = () => fs.writeFileSync(path.join(backup, 'feature-schema-result.json'), JSON.stringify(result), { mode: 0o600 });
  record();
  for (const op of pending) {
    // Check each addition again, supporting safe restart after partial additive DDL.
    if (await exists(db, op)) continue;
    await db.$executeRawUnsafe(op.sql);
    result.executed.push(`${op.table}.${op.name}`);
    if (op.kind === 'table') {
      result.created_tables.push(op.table);
      // Hash-pinned seed SQL only runs directly after creating its empty table.
      if (op.seedSql) await db.$executeRawUnsafe(op.seedSql);
      if (op.table === 'device_quota_windows') {
        const [row] = await db.$queryRaw`SELECT COUNT(*) AS total FROM device_quota_windows`;
        result.created_table_counts[op.table] = String(row.total);
      }
    }
    record();
  }
  return result;
}
module.exports = { operations, validateDiff, plan, apply, requireBackups };
if (require.main === module) {
  require('@next/env').loadEnvConfig(process.cwd(), false, { info() {}, error() {} });
  const { PrismaClient } = require('@prisma/client');
  const db = new PrismaClient({ log: [] });
  (async () => {
    const [mode, diffPath, backup] = process.argv.slice(2);
    const diff = fs.readFileSync(diffPath, 'utf8');
    if (mode === 'plan') {
      const pending = await plan(db, diff);
      console.log(JSON.stringify({ pending: pending.map(op => `${op.table}.${op.name}`) }));
    } else if (mode === 'apply') {
      const result = await apply(db, diff, backup);
      console.log('APPROVED_ADDITIVE_SCHEMA_UPGRADE_DONE', result.executed.length);
    } else throw Error('Expected plan or apply');
  })().catch(() => { console.error('APPROVED_SCHEMA_UPGRADE_FAILED (details retained privately)'); process.exitCode = 1; }).finally(() => db.$disconnect());
}

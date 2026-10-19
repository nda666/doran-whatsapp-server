const assert = require('node:assert/strict');
require('@next/env').loadEnvConfig(process.cwd(), false, { info() {}, error() {} });
// Load the compiled middleware exactly as PM2 does, without tsconfig-paths.
const { queueAccess } = require('../dist/src/server/queueAccess');
const { prisma } = require('../dist/src/lib/prisma');
let status = 200;
const response = { status(code) { status = code; return this; }, json() { return this; }, setHeader() {} };
queueAccess({ method: 'GET', headers: {}, cookies: {} }, response, () => { throw new Error('Anonymous queue access'); });
setImmediate(async () => {
  try { assert.equal(status, 401); console.log('COMPILED_QUEUE_MIDDLEWARE_LOAD_AND_ANONYMOUS_DENIAL_OK'); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
  finally { await prisma.$disconnect(); }
});

'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { ESLint } = require('eslint');
const app = path.resolve(__dirname, '..');
async function main() {
  const eslint = new ESLint({ cwd: app });
  const [result] = await eslint.lintText('export default function Probe(){return <a href="/signin"><img src="/test.png" alt="test" /></a>}', { filePath: path.join(app, 'src/pages/tooling-probe.tsx') });
  assert.ok(result.messages.some(m => m.ruleId === '@next/next/no-html-link-for-pages'));
  assert.ok(result.messages.some(m => m.ruleId === '@next/next/no-img-element'));
  console.log('NEXT_LINT_ROUTE_AND_IMAGE_RULES_OK');
  const probe = path.join(app, 'deployment/tooling-watch-probe.cjs');
  const probeLog = probe + '.log';
  const code = marker => `const {appendFileSync}=require('node:fs');appendFileSync(${JSON.stringify(probeLog)},'${marker}:'+process.pid+'\\n');setInterval(()=>{},1000);`;
  fs.writeFileSync(probe, code('FIRST'));
  const watcher = require('./watch-typescript.cjs').watchProcess([probe], [probe], { cwd: app });
  const waitFor = async word => {
    for (let i = 0; i < 100; i++) {
      if (fs.existsSync(probeLog) && fs.readFileSync(probeLog, 'utf8').includes(word)) return;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    throw new Error('Node watch did not restart: ' + word);
  };
  try {
    await waitFor('FIRST');
    fs.writeFileSync(probe, code('SECOND'));
    await waitFor('SECOND');
    console.log('CHOKIDAR4_WATCH_RESTART_OK');
  } finally {
    await watcher.close();
    for (const p of [probe, probeLog]) if (fs.existsSync(p)) fs.unlinkSync(p);
  }
  // Resolve the real application's aliases/transitive imports without starting its server or a worker.
  const codeCheck = 'const compiler=require("ts-node").register({project:"tsconfig.server.json"});require("tsconfig-paths").register({baseUrl:process.cwd(),paths:compiler.config.options.paths});const {prisma}=require("@/lib/prisma");const makeWASocket=require("@/server/libs/makeWASocket").default;makeWASocket("test","test").then(()=>process.exit(1)).catch(async e=>{if(!e.message.includes("dinonaktifkan"))process.exit(1);await prisma.$disconnect();console.log("NODE_TYPESCRIPT_IMPORTS_AND_OFFLINE_GUARD_OK");process.exit(0)})';
  const sourceCheck = spawn(process.execPath, ['-e', codeCheck], {
    cwd: app, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, WHATSAPP_ENABLED: 'false', QUEUE_ENABLED: 'false' },
  });
  let output = '';
  sourceCheck.stdout.on('data', d => output += d);
  sourceCheck.stderr.on('data', d => output += d);
  const exit = await new Promise(resolve => sourceCheck.on('close', resolve));
  assert.equal(exit, 0, output);
  assert.ok(output.includes('NODE_TYPESCRIPT_IMPORTS_AND_OFFLINE_GUARD_OK'), 'Application import test did not complete');
  console.log(output.trim());
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });



'use strict';
const { spawn } = require('node:child_process');
const path = require('node:path');
const chokidar = require('chokidar');
function watchProcess(args, paths, options = {}) {
  let child, timer, stopping = false, restarting = false, pending = false;
  const start = () => { if (!stopping) child = spawn(process.execPath, args, { stdio: 'inherit', ...options }); };
  const stop = () => new Promise(resolve => {
    if (!child || child.exitCode !== null || child.signalCode !== null) return resolve();
    const current = child;
    const deadline = setTimeout(() => current.kill('SIGKILL'), 10000);
    current.once('close', () => { clearTimeout(deadline); resolve(); });
    current.kill('SIGINT');
  });
  const restart = async () => {
    if (stopping) return;
    if (restarting) { pending = true; return; }
    restarting = true;
    await stop();
    start();
    restarting = false;
    if (pending) { pending = false; restart(); }
  };
  const watcher = chokidar.watch(paths, { ignoreInitial: true, ignored: p => p.endsWith('.spec.ts') });
  watcher.on('all', () => { clearTimeout(timer); timer = setTimeout(restart, 300); });
  watcher.on('error', error => console.error('File watcher failed:', error.message));
  start();
  return { close: async () => { stopping = true; clearTimeout(timer); await watcher.close(); await stop(); } };
}
module.exports = { watchProcess };
if (require.main === module) {
  const app = path.resolve(__dirname, '..');
  const watcher = watchProcess([path.join(__dirname, 'run-typescript.cjs'), process.argv[2] || 'server'], [path.join(app, 'src'), path.join(app, 'public/locales')], { cwd: app });
  let closing = false;
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, async () => { if (closing) return; closing = true; await watcher.close(); process.exit(0); });
}

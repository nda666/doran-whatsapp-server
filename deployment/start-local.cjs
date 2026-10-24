'use strict';
const path = require('node:path');
const net = require('node:net');
const fs = require('node:fs');
const { spawn } = require('node:child_process');
const root = path.resolve(__dirname, '..');
process.chdir(root);
process.env.NODE_ENV = 'development';
process.env.DORAN_LOCAL = 'true';
process.env.TS_NODE_FILES = 'true';
require('@next/env').loadEnvConfig(root, true);
const origin = 'http://localhost:3000';
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
function portOpen(port) {
  return new Promise(resolve => {
    const socket = net.connect({ host: '127.0.0.1', port });
    socket.setTimeout(1500);
    const finish = result => { socket.destroy(); resolve(result); };
    socket.once('connect', () => finish(true));
    socket.once('error', () => finish(false));
    socket.once('timeout', () => finish(false));
  });
}
function openBrowser() {
  const browser = spawn('rundll32.exe', ['url.dll,FileProtocolHandler', origin + '/signin'], { detached: true, stdio: 'ignore', windowsHide: true });
  browser.on('error', () => console.log('Buka browser: ' + origin + '/signin'));
  browser.unref();
}
async function ready() {
  try {
    const response = await fetch(origin + '/api/auth/providers', { signal: AbortSignal.timeout(5000) });
    const providers = await response.json();
    return response.ok && providers.credentials?.type === 'credentials';
  } catch { return false; }
}
async function main() {
  const database = new URL(process.env.DATABASE_URL || '');
  if (database.hostname !== '127.0.0.1' || database.pathname !== '/wa_local' || process.env.NEXTAUTH_URL !== origin) {
    throw new Error('Konfigurasi lokal tidak sesuai. Periksa .env.development.local.');
  }
  if (await portOpen(3000)) {
    if (!(await ready())) throw new Error('Port 3000 dipakai aplikasi lain. Tutup aplikasi tersebut dahulu.');
    console.log('Aplikasi sudah berjalan. Membuka browser...');
    openBrowser();
    return;
  }
  const lockPath = path.join(root, 'storage', 'local', 'startup.lock');
  fs.mkdirSync(path.dirname(lockPath), { recursive: true });
  let acquired = false;
  for (let attempt = 0; attempt < 3 && !acquired; attempt++) {
    try {
      const fd = fs.openSync(lockPath, 'wx');
      fs.writeFileSync(fd, String(process.pid));
      fs.closeSync(fd);
      acquired = true;
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      const owner = Number(fs.readFileSync(lockPath, 'utf8'));
      let ownerAlive = false;
      if (Number.isInteger(owner) && owner > 0) {
        try { process.kill(owner, 0); ownerAlive = true; } catch (check) { ownerAlive = check.code === 'EPERM'; }
      }
      if (ownerAlive) {
        console.log('Aplikasi sedang dimulai dari jendela lain. Menunggu...');
        const startupDeadline = Date.now() + 240000;
        while (Date.now() < startupDeadline) {
          if (await ready()) { openBrowser(); return; }
          await pause(2000);
        }
        throw new Error('Startup belum selesai. Periksa jendela server yang pertama.');
      }
      fs.unlinkSync(lockPath);
    }
  }
  if (!acquired) throw new Error('Launcher lain sedang dimulai. Coba lagi beberapa saat.');
  const releaseLock = () => {
    try { if (fs.readFileSync(lockPath, 'utf8') === String(process.pid)) fs.unlinkSync(lockPath); } catch {}
  };
  process.once('exit', releaseLock);
  if (!(await portOpen(3306))) {
    console.log('Database belum aktif. Membuka Laragon dan menunggu database...');
    await new Promise((resolve, reject) => {
      const laragon = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', "Start-Process -FilePath 'D:/laragon/laragon.exe' -WindowStyle Hidden"], { stdio: 'ignore', windowsHide: true });
      laragon.on('error', reject);
      laragon.on('exit', code => code === 0 ? resolve() : reject(new Error('Laragon belum dapat dibuka.')));
    });
    const databaseDeadline = Date.now() + 60000;
    while (!(await portOpen(3306)) && Date.now() < databaseDeadline) await pause(1000);
    if (!(await portOpen(3306))) throw new Error('Database belum aktif. Buka Laragon, klik Start All, lalu klik shortcut ini lagi.');
  }
  if (await require('./local-device-channel.cjs').ensureLocalDeviceChannel()) console.log('Kolom kanal perangkat lokal siap; perangkat lama tetap WhatsApp.');
  console.log('Menjalankan Doran WA Local. Browser akan terbuka setelah aplikasi siap.');
  console.log('Biarkan jendela ini terbuka. Tekan Ctrl+C untuk menghentikan aplikasi.');
  const child = spawn(process.execPath, [path.join(__dirname, 'watch-typescript.cjs'), 'server'], { cwd: root, env: process.env, stdio: 'inherit' });
  let ended = false;
  child.on('error', error => { console.error(error.message); process.exitCode = 1; ended = true; });
  child.on('exit', code => { ended = true; process.exitCode = code || 0; });
  process.on('SIGINT', () => { ended = true; child.kill('SIGINT'); });
  const deadline = Date.now() + 240000;
  while (!ended && Date.now() < deadline) {
    if (await ready()) { console.log('Aplikasi siap: ' + origin); openBrowser(); return; }
    await pause(2000);
  }
  if (!ended) console.log('Startup lebih lama dari biasanya. Periksa log di atas, lalu buka ' + origin);
}
main().catch(error => { console.error('\n' + error.message); process.exitCode = 1; });





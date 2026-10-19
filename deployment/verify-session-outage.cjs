const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const source = ts.transpileModule(fs.readFileSync('src/components/AccountSessionGuard.tsx', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
}).outputText;
let effects, timers, listeners, logouts, updates, socketClosed, fetchSession, sessionState, failLogout;
const originalFetch = global.fetch, originalSet = global.setTimeout, originalClear = global.clearTimeout;
function reset(state) {
  effects = []; timers = new Map(); listeners = {}; logouts = 0; updates = 0; socketClosed = 0; failLogout = false;
  sessionState = state;
  let id = 0;
  global.setTimeout = (fn, ms) => { timers.set(++id, { fn, ms }); return id; };
  global.clearTimeout = id => timers.delete(id);
  global.fetch = (...args) => fetchSession(...args);
}
function load() {
  const module = { exports: {} };
  const stubs = {
    react: { useEffect: fn => effects.push(fn), useRef: () => ({ current: false }) },
    'next/router': { useRouter: () => ({ pathname: '/dashboard/phone' }) },
    'next-auth/react': {
      useSession: () => ({ ...sessionState, update: async () => { updates++; } }),
      signOut: async () => { logouts++; if (failLogout) throw new Error('503'); },
    },
    'socket.io-client': { io: () => ({ on: (event, fn) => { listeners[event] = fn; }, disconnect: () => { socketClosed++; } }) },
  };
  new Function('require', 'module', 'exports', source)(name => stubs[name], module, module.exports);
  return module.exports;
}
const response = (body, ok = true) => ({ ok, json: async () => body });
const flush = async () => { for (let i = 0; i < 15; i++) await Promise.resolve(); };
const retry = async () => {
  const entry = [...timers].find(([, timer]) => timer.ms === 5000);
  assert(entry, 'Expected a retry'); timers.delete(entry[0]); entry[1].fn(); await flush();
};
(async () => {
  reset({ data: null, status: 'unauthenticated' });
  const { checkAccountSession, default: Guard } = load();
  const signal = new AbortController().signal;
  for (const [fixture, expected] of [
    [response(null, false), 'unavailable'],
    [response('<html>503</html>'), 'unavailable'],
    [response({ error: 'temporary' }), 'unavailable'],
    [response({ expires: 'date', user: { id: 'u', isActive: true } }), 'active'],
  ]) {
    fetchSession = async () => fixture;
    assert.equal(await checkAccountSession(signal), expected);
  }
  for (const body of [null, {}, { expires: 'date' }, { expires: 'date', user: { id: 'u', isActive: false } }]) {
    fetchSession = async () => response(body); assert.equal(await checkAccountSession(signal), 'inactive');
  }
  fetchSession = async () => { throw new Error('network down'); };
  assert.equal(await checkAccountSession(signal), 'unavailable');
  fetchSession = async () => response(null, false);
  Guard(); const cleanup = effects[0](); await flush();
  assert.equal(logouts, 0); await retry(); assert.equal(logouts, 0);
  fetchSession = async () => response({ expires: 'date', user: { id: 'u', isActive: true } });
  await retry(); assert.equal(updates, 1); assert.equal(logouts, 0); cleanup();
  assert.equal(timers.size, 0);
  reset({ data: null, status: 'unauthenticated' });
  fetchSession = async () => response({ expires: 'date' });
  load().default(); effects[0](); await flush(); assert.equal(logouts, 1);
  reset({ data: null, status: 'unauthenticated' });
  let resolveFetch; fetchSession = () => new Promise(resolve => { resolveFetch = resolve; });
  load().default(); const cancel = effects[0](); cancel(); resolveFetch(response(null)); await flush(); assert.equal(logouts, 0);
  reset({ data: { user: { id: 'u', token: 'fixture', isActive: true } }, status: 'authenticated' });
  load().default(); const close = effects[0]();
  listeners['account:disabled'](); listeners['account:disabled'](); await flush(); assert.equal(logouts, 1);
  close(); assert.equal(socketClosed, 1);
  reset({ data: { user: { id: 'u', token: 'fixture', isActive: true } }, status: 'authenticated' });
  failLogout = true; fetchSession = async () => response(null, false);
  load().default(); const closeFailed = effects[0](); listeners['account:disabled'](); await flush();
  await retry(); assert.equal(logouts, 1); closeFailed();
  console.log('SESSION_OUTAGE_OK: HTTP failures/network errors preserve login; recovery refreshes session; confirmed invalid sessions and disabled accounts log out; unmounted checks cannot log out.');
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => {
  global.fetch = originalFetch; global.setTimeout = originalSet; global.clearTimeout = originalClear;
});

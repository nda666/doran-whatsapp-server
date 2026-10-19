const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const ts = require('typescript');
const defaults = value => ({ __esModule: true, default: value });
function load(relative, stubs = {}) {
  const filename = path.resolve(__dirname, '..', relative), module = { exports: {} };
  const source = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const real = createRequire(filename);
  new Function('require','module','exports',source)(name => Object.hasOwn(stubs,name) ? stubs[name] : real(name),module,module.exports);
  return module.exports;
}
const access = load('src/lib/access.ts');
const actor = { id: 'admin', email: 'admin@gmail.com', role: 'ADMIN', approvalStatus: 'APPROVED', isActive: true, sessionVersion: 0 };
let user = { id: 'user', email: 'user@example.invalid', role: 'USER', approvalStatus: 'APPROVED', isActive: true, sessionVersion: 0, password: 'hash' };
let deletes = 0, signals = 0, disconnects = 0;
const db = { user: {
  findUnique: async () => user, findFirst: async () => user,
  update: async ({ data }) => { user = { ...user, ...data, sessionVersion: data.sessionVersion ? user.sessionVersion + data.sessionVersion.increment : user.sessionVersion }; return user; },
}, session: { deleteMany: async () => { deletes++; } } };
db.$transaction = fn => fn(db);
const socket = { to: id => { assert.equal(id,'user'); return { emit: event => { assert.equal(event,'account:disabled'); signals++; } }; }, in: () => ({ disconnectSockets: value => { assert.equal(value,true); disconnects++; } }) };
const response = () => ({ code: 200, setHeader() {}, status(n) { this.code=n;return this; }, json(v) { this.body=v;return this; }, end() {} });
(async () => {
  assert(access.isApproved(user)); assert(!access.isApproved({ ...user, isActive: false }));
  assert(!access.isSuperAdmin({ ...actor, isActive: false }));
  assert(access.isCurrentSession(user, {}));
  const handler=load('src/pages/api/admin/users/[id]/active.ts', {
    '@/lib/prisma': { prisma: db }, '@/lib/access': access, '@/middleware/apiSuperAdminMiddleware': defaults(fn=>fn), '@/server/libs/socket': { getSocketIO: socket },
  }).default;
  const patch = async body => { const res=response();await handler({method:'PATCH',body,query:{id:user.id},user:actor},res);return res; };
  assert.equal((await patch({isActive:'false'})).code,400);
  assert.equal((await patch({isActive:false})).code,200);
  assert.equal(user.isActive,false);assert.equal(user.sessionVersion,1);assert.equal(deletes,1);assert.equal(signals,1);assert.equal(disconnects,1);
  assert(!access.isCurrentSession(user,{sessionVersion:0}));
  assert.equal((await patch({isActive:true})).code,200);
  assert.equal(user.sessionVersion,1); assert(!access.isCurrentSession(user,{})); assert(access.isCurrentSession(user,{sessionVersion:1}));
  const auth=load('src/middleware/apiAuthMiddleware.ts', { '../lib/prisma': { prisma: db }, '../lib/access': access, 'next-auth/jwt': { getToken: async()=>({id:user.id,sessionVersion:0}) } }).default;
  let ran=0,res=response();await auth(()=>{ran++;})({method:'GET',headers:{}},res);assert.equal(res.code,401);assert.equal(ran,0);
  user.isActive=false;res=response();await auth(()=>{ran++;})({method:'GET',headers:{authorization:'Bearer test'}},res);assert.equal(res.code,403);assert.equal(ran,0);
  const signin=load('src/pages/api/signin.ts', { '@/lib/prisma': {prisma:db}, '@/lib/access':access, bcrypt: defaults({compare:async()=>true}) }).default;
  res=response();await signin({method:'POST',body:{email:user.email,password:'fixture'}},res);assert.equal(res.code,403);assert(res.body.message.includes('tidak aktif'));
  user.isActive=true;res=response();await signin({method:'POST',body:{email:user.email,password:'fixture'}},res);assert.equal(res.code,200);assert.equal(res.body.sessionVersion,1);
  const config=load('src/pages/api/auth/[...nextauth].ts', { 'next-auth':defaults(options=>options), '@/lib/prismaAdapter':{PrismaAdapter:()=>({})}, '@prisma/client':{PrismaClient:class {user=db.user;}}, '@/lib/access':access }).default;
  assert.equal((await config.callbacks.session({session:{user:{}},token:{id:user.id,sessionVersion:0}})).user,undefined);
  assert.equal((await config.callbacks.session({session:{user:{}},token:{id:user.id,sessionVersion:1}})).user.isActive,true);
  user.isActive=false;assert.equal((await config.callbacks.session({session:{user:{}},token:{id:user.id,sessionVersion:1}})).user,undefined);
  const effects=[], listeners={};let logouts=0;
  const Guard=load('src/components/AccountSessionGuard.tsx', {
    react:{useEffect:fn=>effects.push(fn),useRef:()=>({current:false})},
    'next/router':{useRouter:()=>({pathname:'/dashboard'})},
    'next-auth/react':{useSession:()=>({data:{user:{id:'user',token:'test',isActive:true,sessionVersion:1}},status:'authenticated'}),signOut:async options=>{assert.equal(options.callbackUrl,'/signin?reason=inactive');logouts++;}},
    'socket.io-client':{io:()=>({on:(event,fn)=>{listeners[event]=fn;},disconnect:()=>{}})},
  }).default;
  Guard();const cleanup=effects[0]();listeners['account:disabled']();listeners['account:disabled']();assert.equal(logouts,1);cleanup();
  user={...actor};assert.equal((await patch({isActive:false})).code,409);
  user=null;res=response();await handler({method:'PATCH',body:{isActive:false},query:{id:'missing'},user:actor},res);assert.equal(res.code,404);
  console.log('USER_ACTIVE_OK: deactivate/revoke/emit, inactive login and API denied, stale JWT rejected after reactivation, fresh login, super admin protected');
})().catch(error=>{console.error(error);process.exitCode=1;});

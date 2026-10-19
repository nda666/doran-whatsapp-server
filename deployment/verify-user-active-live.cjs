const assert = require('node:assert/strict');
const { randomUUID, randomBytes } = require('node:crypto');
const { io } = require('socket.io-client');
require('@next/env').loadEnvConfig(process.cwd());
const { PrismaClient } = require('@prisma/client');
const db = new PrismaClient(), base = 'https://dashboard.jeblast.com';
const prefix = 'active-live-'+randomUUID(), email = prefix+'@example.invalid';
const password = randomBytes(24).toString('hex');
let connectedSocket;
async function login() {
  const csrf = await fetch(base+'/api/auth/csrf');
  const cookie = csrf.headers.getSetCookie().map(c=>c.split(';')[0]).join('; ');
  const { csrfToken } = await csrf.json();
  const result = await fetch(base+'/api/auth/callback/credentials', {method:'POST',headers:{Cookie:cookie,'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({csrfToken,email,password,callbackUrl:base+'/dashboard',json:'true'})});
  assert.equal(result.status,200);const body=await result.json();assert.equal(new URL(body.url).pathname,'/dashboard');
  const cookies=result.headers.getSetCookie();assert(cookies.some(c=>c.startsWith('__Secure-next-auth.session-token=')));
  return cookies.map(c=>c.split(';')[0]).join('; ');
}
const session=async cookie=>(await fetch(base+'/api/auth/session',{headers:{Cookie:cookie}})).json();
async function socketFor(user, permitted) {
  const socket=io(base,{path:'/socket.io',auth:{token:user.token,sessionVersion:user.sessionVersion},transports:['websocket'],reconnection:false,timeout:15000});
  await new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>{socket.disconnect();reject(new Error('Socket verification timeout'));},20000);
    socket.once('connect',()=>{clearTimeout(timer);permitted?resolve():reject(new Error('Stale socket accepted'));});
    socket.once('connect_error',()=>{clearTimeout(timer);socket.disconnect();permitted?reject(new Error('Active socket rejected')):resolve();});
  });
  return socket;
}
(async()=>{
  const admin=await db.user.findUniqueOrThrow({where:{email:'admin@gmail.com'}});
  const headers={Authorization:'Bearer '+admin.token,'Content-Type':'application/json'};
  const profile={name:'Temporary active status verification',email,password,role:'USER',deviceLimit:100,plan:'Standard',isActive:true};
  const create=await fetch(base+'/api/admin/users',{method:'POST',headers,body:JSON.stringify(profile)});assert.equal(create.status,201);
  let user=await db.user.findUniqueOrThrow({where:{email}});assert(user.isActive);assert.equal(user.sessionVersion,0);
  const cookie=await login();assert.equal((await session(cookie)).user.id,user.id);
  connectedSocket=await socketFor(user,true);
  const disabledSignal=new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(new Error('Logout socket event missing')),15000);
    connectedSocket.once('account:disabled',()=>{clearTimeout(timer);resolve();});
  });
  const activeUrl=base+'/api/admin/users/'+user.id+'/active';
  assert.equal((await fetch(activeUrl,{method:'PATCH',headers:{Authorization:'Bearer '+user.token,'Content-Type':'application/json'},body:JSON.stringify({isActive:false})})).status,403);
  const patch=async isActive=>{const result=await fetch(activeUrl,{method:'PATCH',headers,body:JSON.stringify({isActive})});assert.equal(result.status,200);};
  await patch(false);await disabledSignal;connectedSocket.disconnect();connectedSocket=null;
  user=await db.user.findUniqueOrThrow({where:{email}});assert(!user.isActive);assert.equal(user.sessionVersion,1);
  assert.equal((await session(cookie)).user,undefined);
  assert.equal((await fetch(base+'/api/signin',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password})})).status,403);
  assert.equal((await fetch(base+'/api/phones',{headers:{Authorization:'Bearer '+user.token}})).status,403);
  assert.equal((await fetch(base+'/api/phones',{headers:{Cookie:cookie}})).status,403);
  await socketFor(user,false);
  await patch(true);assert.equal((await session(cookie)).user,undefined);
  assert.equal((await fetch(base+'/api/phones',{headers:{Cookie:cookie}})).status,401);
  await socketFor({...user,sessionVersion:0},false);
  const freshCookie=await login();assert.equal((await session(freshCookie)).user.sessionVersion,1);
  assert.equal((await fetch(base+'/api/phones',{headers:{Cookie:freshCookie}})).status,200);
  // The edit form must enforce the same revocation as the quick action.
  const edit=await fetch(base+'/api/admin/users',{method:'POST',headers,body:JSON.stringify({...profile,id:user.id,password:undefined,isActive:false})});assert.equal(edit.status,200);
  assert.equal((await session(freshCookie)).user,undefined);
  assert.equal((await db.user.findUniqueOrThrow({where:{email}})).sessionVersion,2);
  assert.equal((await fetch(base+'/api/admin/users/'+admin.id+'/active',{method:'PATCH',headers,body:JSON.stringify({isActive:false})})).status,409);
  const selfEdit=await fetch(base+'/api/admin/users',{method:'POST',headers,body:JSON.stringify({id:admin.id,name:admin.name,email:admin.email,role:admin.role,deviceLimit:admin.deviceLimit,plan:admin.plan,isActive:false})});assert.equal(selfEdit.status,409);
  const page=await fetch(base+'/dashboard/admin?tab=users',{headers:{Cookie:await (async()=>{const {encode}=require('next-auth/jwt');return '__Secure-next-auth.session-token='+await encode({token:{id:admin.id,token:admin.token,email:admin.email,sessionVersion:admin.sessionVersion},secret:process.env.NEXTAUTH_SECRET});})()}});assert.equal(page.status,200);
  const html=await page.text(), chunks=[...html.matchAll(/<script[^>]*src="([^"]+\.js)"/g)].map(m=>m[1]);
  const js=(await Promise.all(chunks.map(async chunk=>(await fetch(new URL(chunk,base))).text()))).join('\n');
  for(const label of ['Status user','Tidak aktif','Nonaktifkan','account:disabled','sessionVersion'])assert(js.includes(label),label);
  console.log('USER_ACTIVE_LIVE_OK: real credential login, inactive denial, immediate socket logout, stale JWT and socket remain revoked after reactivation, edit revocation, super admin protection');
})().catch(error=>{console.error(error.message);process.exitCode=1;}).finally(async()=>{
  connectedSocket?.disconnect();
  assert(email.startsWith('active-live-') && email.endsWith('@example.invalid'));
  const result=await db.user.deleteMany({where:{email}});console.log('EXACT_ACTIVE_TEST_ACCOUNT_REMOVED',result.count);await db.$disconnect();
});

const assert = require('node:assert/strict');
require('@next/env').loadEnvConfig(process.cwd(), false);
const { PrismaClient } = require('@prisma/client');
const db = new PrismaClient();
async function request(path, token, number, method) {
 const response = await fetch('https://dashboard.jeblast.com' + path + (method === 'GET' && number ? '?' + new URLSearchParams({number}) : ''), {
  method, headers: {Authorization:'Bearer '+token, ...(method==='POST'?{'Content-Type':'application/json'}:{})},
  ...(method==='POST'?{body:JSON.stringify(number?{number}:{})}:{}), signal:AbortSignal.timeout(20000)
 });
 assert.equal(response.status,200);const body=await response.json();assert.equal(body.result,true);
 assert(body.data.length);for(const phone of body.data){assert.equal(phone.device_id,phone.id);assert.equal(typeof phone.device_id,'string');assert(!Object.hasOwn(phone,'qrCode'));}
 return body;
}
(async()=>{
 const admin=await db.user.findUniqueOrThrow({where:{email:'admin@gmail.com'}});
 const adminDevice=await db.phone.findFirstOrThrow({where:{userId:admin.id}});
 let count=0;
 for(const root of ['/api/','/api/public/'])for(const method of ['GET','POST'])for(const token of [admin.token,adminDevice.token]){
  const list=await request(root+'list-phones',token,null,method);assert.equal(list.access.scope,'all');
  const phone=list.data.find(p=>p.number&&/^\d{10,15}$/.test(p.number));assert(phone);
  const detail=await request(root+'phone-detail',token,phone.number,method);assert(detail.data.some(p=>p.device_id===phone.device_id));count+=2;
 }
 console.log('DIRECTORY_DEVICE_ID_LIVE_OK: '+count+' read-only requests, GET/POST, aliases, user/device token; device_id equals id');
})().catch(()=>{console.error('DIRECTORY_DEVICE_ID_LIVE_FAILED');process.exitCode=1;}).finally(()=>db.$disconnect());

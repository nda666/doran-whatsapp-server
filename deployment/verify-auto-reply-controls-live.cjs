const assert = require('node:assert/strict');
require('@next/env').loadEnvConfig(process.cwd());
const { PrismaClient } = require('@prisma/client');
const db = new PrismaClient();
(async()=>{
  const user=await db.user.findFirstOrThrow({where:{email:'admin@gmail.com',role:'ADMIN',isActive:true}});
  const {encode}=require('next-auth/jwt');
  const jwt=await encode({token:{id:user.id,token:user.token,name:user.name,email:user.email,role:user.role,approvalStatus:user.approvalStatus,sessionVersion:user.sessionVersion},secret:process.env.NEXTAUTH_SECRET});
  const headers={Cookie:'__Secure-next-auth.session-token='+jwt+'; next-auth.session-token='+jwt};
  const base='https://dashboard.jeblast.com';
  for(const [page,texts] of [['phone',['Aktifkan Balasan Otomatis']],['auto-reply',['Perangkat WhatsApp','Aktifkan Balasan Ini','Tambah Balasan Otomatis','Edit Balasan Otomatis']]]){
    const response=await fetch(base+'/dashboard/'+page,{headers});assert.equal(response.status,200);assert.equal(new URL(response.url).pathname,'/dashboard/'+page);
    const html=await response.text();
    const asset=[...html.matchAll(new RegExp('src="([^" ]+/pages/dashboard/'+page+'-[^" ]+\\.js)"','g'))][0];assert(asset,page);
    const bundle=await (await fetch(new URL(asset[1],base))).text();for(const text of texts)assert(bundle.includes(text),text);
  }
  const response=await fetch(base+'/api/phones?options=1',{headers});assert.equal(response.status,200);
  const devices=await response.json();for(const device of devices){assert.equal(typeof device.autoReplyEnabled,'boolean');const stored=await db.phone.findUnique({where:{id:device.id}});assert.equal(device.autoReplyEnabled,stored.autoReplyEnabled);}
  const columns=await db.$queryRawUnsafe("SELECT COLUMN_DEFAULT FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='phones' AND COLUMN_NAME='autoReplyEnabled'");assert.equal(String(columns[0].COLUMN_DEFAULT),'0');
  const status=await db.$queryRawUnsafe("SELECT COLUMN_DEFAULT FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='auto_replies' AND COLUMN_NAME='reply_status'");assert.equal(status[0].COLUMN_DEFAULT,'inactive');
  console.log('AUTO_REPLY_CONTROLS_LIVE_OK: authenticated UI, API/device status consistency, database defaults');
})().catch(error=>{console.error(error.message);process.exitCode=1;}).finally(()=>db.$disconnect());

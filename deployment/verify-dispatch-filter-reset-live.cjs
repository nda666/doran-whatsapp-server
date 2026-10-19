'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {randomUUID} = require('node:crypto');
require('@next/env').loadEnvConfig(process.cwd());
const {PrismaClient} = require('@prisma/client');
const db = new PrismaClient();
const base = 'https://dashboard.jeblast.com';
const {defaultDispatchDates} = require('../dist/src/lib/dispatchDateFilter');
const totalCounts = body => Object.values(body.counts).reduce((sum,n)=>sum+n,0);
(async()=>{
  const admin = await db.user.findFirstOrThrow({where:{email:'admin@gmail.com',role:'ADMIN'}});
  const ordinary = await db.user.findFirst({where:{role:'USER',approvalStatus:'APPROVED',isActive:true}});
  for(const user of [admin,ordinary].filter(Boolean)) {
    const headers = {Authorization:'Bearer '+user.token};
    const get = async extra => {
      const response = await fetch(base+'/api/dispatch?'+new URLSearchParams({...defaultDispatchDates(),limit:'1',...extra}),{headers});
      assert.equal(response.status,200);return response.json();
    };
    const missing = '__filter_reset_missing_'+randomUUID();
    const initial = await get({status:'QUEUED',store_id:missing});
    assert.equal(initial.total,0);
    const filtered = await get({summary_filtered:'1',status:'QUEUED',store_id:missing});
    assert.equal(filtered.total,0);assert.equal(totalCounts(filtered),0);
    const conflict = await get({summary_filtered:'1',store_id:'default',store_filter:'non_default'});
    assert.equal(conflict.total,0);assert.equal(totalCounts(conflict),0);
    const restored = await get({status:'QUEUED',store_id:missing,summary_filtered:'0'});
    assert.equal(restored.total,0);
    if(totalCounts(initial)>0) assert(totalCounts(restored)>0);
    const post = body => fetch(base+'/api/dispatch-reset',{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify(body)});
    assert.equal((await post({id:'invalid'})).status,400);
    assert.equal((await post({id:randomUUID()})).status,404);
    const sent = await db.waDispatch.findFirst({where:{...(user===admin?{}:{userId:user.id}),status:{in:['SENT','DELIVERED','READ']}}});
    if(sent) assert.equal((await post({id:sent.id})).status,409);
    if(user===ordinary) {
      const other = await db.waDispatch.findFirst({where:{userId:{not:user.id}}});
      if(other) assert.equal((await post({id:other.id})).status,404);
    }
    assert.equal((await fetch(base+'/api/dispatch-reset',{headers})).status,405);
  }
  assert.equal((await fetch(base+'/api/dispatch-reset',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:randomUUID()})})).status,401);
  const manifest = JSON.parse(fs.readFileSync('.next/build-manifest.json','utf8'));
  const assets = manifest.pages['/dashboard/dispatch'].filter(asset=>asset.endsWith('.js'));
  assert(assets.length);
  let pageCode='';
  for(const asset of assets) {
    const result = await fetch(base+'/_next/'+asset);assert.equal(result.status,200);
    const content = await result.text();
    assert.equal(content,fs.readFileSync(path.join('.next',asset),'utf8'), 'Served asset differs from build: '+asset);
    pageCode+=content;
  }
  assert(pageCode.includes('summary_filtered'));assert(pageCode.includes('Reset pengiriman'));
  console.log('DISPATCH_FILTER_RESET_LIVE_OK: filtered/default summary, impossible filter, admin/owner access, reset validation/status guards, authentication, page and assets; no real messages reset');
})().catch(error=>{console.error(error.message);process.exitCode=1;}).finally(()=>db.$disconnect());

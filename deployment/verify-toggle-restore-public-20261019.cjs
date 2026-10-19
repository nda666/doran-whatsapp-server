const assert=require('node:assert/strict'),fs=require('node:fs');
(async()=>{
 const base='https://dashboard.jeblast.com';
 const response=await fetch(base+'/signin');assert.equal(response.status,200);
 const html=await response.text();const data=JSON.parse(html.match(/<script id="__NEXT_DATA__"[^>]*>(.*?)<\/script>/s)[1]);
 assert.notEqual(data.buildId,'Du9AiVqPOAqDpSBbheCWp','Previous build still served');
 const mr=await fetch(base+'/_next/static/'+data.buildId+'/_buildManifest.js');assert.equal(mr.status,200);
 const vm=require('node:vm'),ctx={self:{}};vm.runInNewContext(await mr.text(),ctx);
 for(const route of ['/dashboard/plans','/dashboard/admin','/dashboard/phone']){
 const chunks=ctx.self.__BUILD_MANIFEST[route];assert(chunks?.length);
 for(const chunk of chunks.filter(c=>c.endsWith('.js'))){const r=await fetch(base+'/_next/'+chunk);assert.equal(r.status,200);}
 console.log('PUBLIC_ASSETS_OK',route);
 }
 fs.writeFileSync('output/toggle-restore-public-assets-20261019.json',JSON.stringify({build:data.buildId,status:response.status,checkedAt:new Date().toISOString()},null,2));
 console.log('PUBLIC_RESTORE_BUILD_VERIFIED',data.buildId);
})().catch(e=>{console.error(e);process.exitCode=1;});

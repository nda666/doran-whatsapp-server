'use strict';
// Explicit opt-in. Synthetic rows use an unregistered UUID and a live test lease.
const assert=require('node:assert/strict'),path=require('node:path'),crypto=require('node:crypto'),fs=require('node:fs');
if(process.env.ALLOW_AUTH_MAINTENANCE_DB_TEST!=='1')throw Error('Explicit DB integration opt-in required');
require('@next/env').loadEnvConfig(process.cwd(),false,{info(){},error(){}});
const {PrismaClient}=require('@prisma/client'),db=new PrismaClient();
const {writeAuthKeys,pruneAuthTokens,authKeyHash}=require(path.resolve('dist/src/server/libs/authKeyMaintenance.js'));
const {sealWa,openWa}=require(path.resolve('dist/src/server/libs/waStorage.js'));
const {BufferJSON}=require('@whiskeysockets/baileys');
const phoneId=crypto.randomUUID(),leaseToken=crypto.randomUUID();let owned=false;
const row=(name,value)=>{const hash=authKeyHash(name);return{hash,keyName:name,value:sealWa(JSON.stringify(value,BufferJSON.replacer),phoneId+':'+hash)};};
(async()=>{
assert.equal(await db.phone.count({where:{id:phoneId}}),0);
await db.waAuthSession.create({data:{phoneId,migratedAt:new Date(),leaseToken,leaseUntil:new Date(Date.now()+300000)}});owned=true;
if(process.env.AUTH_MAINTENANCE_TEST_BACKUP)fs.writeFileSync(path.join(process.env.AUTH_MAINTENANCE_TEST_BACKUP,'mysql-test-fixture.json'),JSON.stringify({phoneId,createdAt:new Date().toISOString()}),{mode:0o600});
const fresh=Math.floor(Date.now()/1000),old=fresh-40*86400,writes=[];
for(let i=0;i<1000;i++)writes.push(row('pre-key-integration-'+i+'.json',{fixture:i}));
writes.push(row('tctoken-expired.json',{token:Buffer.from('synthetic'),timestamp:old}),row('tctoken-fresh.json',{token:Buffer.from('synthetic'),timestamp:fresh}),row('tctoken-__index.json',{token:Buffer.from(JSON.stringify(['expired','fresh','missing']))}));
await db.$transaction(tx=>writeAuthKeys(tx,phoneId,writes),{timeout:60000});assert.equal(await db.waAuthKey.count({where:{phoneId}}),1003);
const changed=row('pre-key-integration-0.json',{fixture:'updated'});await db.$transaction(tx=>writeAuthKeys(tx,phoneId,[changed,{...writes[999],value:null}]),{timeout:60000});
const persisted=await db.waAuthKey.findUniqueOrThrow({where:{phoneId_keyHash:{phoneId,keyHash:changed.hash}}});assert.equal(JSON.parse(openWa(persisted.value,phoneId+':'+changed.hash)).fixture,'updated');
await assert.rejects(db.$transaction(async tx=>{await writeAuthKeys(tx,phoneId,[row('pre-key-integration-0.json',{fixture:'rollback'})]);throw Error('TEST_ROLLBACK');}),/TEST_ROLLBACK/);
assert.equal((await db.waAuthKey.findUniqueOrThrow({where:{phoneId_keyHash:{phoneId,keyHash:changed.hash}}})).value,persisted.value);
const report=await db.$transaction(async tx=>{await tx.$queryRaw`SELECT phoneId FROM wa_auth_sessions WHERE phoneId=${phoneId} FOR UPDATE`;return pruneAuthTokens(tx,phoneId);},{timeout:60000});
assert.equal(report.removed,1);assert.equal(report.indexRemoved,2);assert.equal(await db.waAuthKey.count({where:{phoneId}}),1001);
console.log('AUTH_MAINTENANCE_MYSQL_OK: 1003 synthetic keys, actual bulk upsert/delete, transaction rollback and expiry/index cleanup');
})().catch(e=>{console.error('AUTH_MAINTENANCE_MYSQL_FAILED',e.code||e.name);process.exitCode=1;}).finally(async()=>{
if(owned){let n;do{n=await db.$executeRaw`DELETE FROM wa_auth_keys WHERE phoneId=${phoneId} LIMIT 200`;}while(n);await db.waAuthSession.deleteMany({where:{phoneId,leaseToken}});assert.equal(await db.waAuthKey.count({where:{phoneId}}),0);}
await db.$disconnect();console.log('AUTH_INTEGRATION_FIXTURE_REMOVED');
});

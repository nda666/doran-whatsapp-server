const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const crypto = require('node:crypto');
const id = crypto.randomUUID();
const filename = `${crypto.randomUUID()}.bin`;
let found = true, recheck = true, sending = 0, commitFails = false, committed = false, deleted = 0, files = [], locks = 0;
const scope = { userId: 'owner' };
const db = {
  chatConversation: {
    findFirst: async ({where}) => {
      assert.equal(where.id,id); assert.equal(where.userId,'owner'); assert.deepEqual(where.phone,scope);
      return found ? {id,phoneId:'phone'} : null;
    },
    delete: async ({where}) => {assert.equal(where.id,id);deleted++;},
  },
  chatMessage: {
    count: async ({where}) => {assert.deepEqual(where,{conversationId:id,status:'SENDING'});return sending;},
    findMany: async ({where,select}) => {assert.equal(where.conversationId,id);assert.deepEqual(select,{mediaPath:true});return [{mediaPath:filename}];},
  },
  $queryRaw: async (sql,phoneId) => {assert.equal(phoneId,'phone');locks++;},
  $transaction: async callback => {
    committed=false;
    const result=await callback({...db,chatConversation:{...db.chatConversation,findFirst:async args=>recheck ? db.chatConversation.findFirst(args) : null}});
    if(commitFails)throw Error('COMMIT_FAILED');
    committed=true; return result;
  },
};
const mocks={
  '@/middleware/apiAuthMiddleware':{__esModule:true,default:handler=>handler},
  '@/lib/prisma':{prisma:db},'@/lib/access':{ownerScope:()=>scope},
  '@/server/chat/public':{publicChatMessage:row=>row},
  '@/server/chat/media':{chatMediaPath:name=>{assert.equal(name,filename);return name;}},
  'node:fs/promises':{unlink:async name=>{assert(committed,'Files must survive a rollback');files.push(name);}},
};
const source=ts.transpileModule(fs.readFileSync('src/pages/api/conversations/[id].ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,esModuleInterop:true}}).outputText;
const mod={exports:{}};
new Function('require','module','exports',source)(key=>key in mocks?mocks[key]:require(key),mod,mod.exports);
async function request(query={id},method='DELETE') {
  const res={code:200,setHeader(){},status(code){this.code=code;return this;},json(data){this.data=data;return this;},end(){return this;}};
  await mod.exports.default({method,query,user:{id:'owner'}},res); return res;
}
(async()=>{
  assert.equal((await request({id:'invalid'})).code,400);
  assert.equal((await request({id},'POST')).code,405);
  found=false;assert.equal((await request()).code,404);assert.equal(locks,0);
  found=true;recheck=false;assert.equal((await request()).code,404);assert.equal(deleted,0);
  recheck=true;sending=1;assert.equal((await request()).code,409);assert.equal(deleted,0);assert.equal(files.length,0);
  sending=0;commitFails=true;await assert.rejects(()=>request(),/COMMIT_FAILED/);assert.equal(files.length,0);
  commitFails=false;assert.equal((await request()).code,200);assert.deepEqual(files,[filename]);
  console.log('CONVERSATION_DELETE_OK: validation, method, owner scope/recheck, phone lock, sending guard and post-commit media cleanup');
})().catch(error=>{console.error(error);process.exitCode=1;});

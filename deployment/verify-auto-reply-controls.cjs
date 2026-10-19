const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const { createRequire } = require('node:module');
function load(file, stubs) {
  const filename = path.resolve(file), mod = { exports: {} }, real = createRequire(filename);
  const source = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText;
  new Function('require','module','exports',source)(name => Object.hasOwn(stubs,name) ? stubs[name] : real(name),mod,mod.exports);
  return mod.exports;
}
(async () => {
  let queried = 0, sent = 0, media = 0, enabled = true;
  const prisma = { autoReply: {
    findMany: async args => { queried++; assert.equal(args.where.reply_status,'active'); assert.equal(args.where.phone.autoReplyEnabled,true); return []; },
    findFirst: async args => { assert.equal(args.where.phone.autoReplyEnabled,true); assert.equal(args.where.reply_status,'active'); return enabled ? {id:1,phone:{showTyping:false}} : null; },
    updateMany: async () => ({count:1}),
  }};
  const service = load('src/services/autoReply.ts', {'../lib/prisma':{prisma}});
  await service.getAutoReplyByPhoneId('phone'); assert.equal(queried,1);
  const stubs = {
    '../utils/mediaUrl': {mediaUrl:()=>''},
    '../utils/webhookSender': {webhookSender:async()=> '628123456789'},
    '../../server/utils': {getImageFromWaMessage:async()=>{media++;}, messageKeywordTypeChecker:()=>true},
    '../../services/autoReply': {getAutoReplyByPhoneId:async()=>{queried++;return[];}},
    '../../services/group': {saveToGrup:async()=>{}},
    '../../services/inboxMessage': {}, '../libs/toBase64': {},
    '../campaigns/autoReply': {sendAutoReply:async()=>{sent++;}},
    '../ai/service': {sendAiAutoReply:async()=>{throw new Error('AI must not run for legacy control tests');}},
  };
  const phone = {id:'phone',userId:'owner',autoReplyEnabled:false};
  await load('src/server/events/handleMessageInEvent.ts',stubs).handleMessageInEvent({phone,messages:[],messageIn:'harga'});
  await load('src/server/events/handleQuotedMessageEvent.ts',stubs).handleQuotedMessageEvent({phone,messages:[],quotedMessage:{}});
  assert.equal(queried,1,'Disabled device must skip rule query'); assert.equal(media,0); assert.equal(sent,0);
  const sender = load('src/server/campaigns/autoReply.ts',{'../../lib/prisma':{prisma},'./content':{},'../dispatch/media':{}});
  const item = {id:1,reply_status:'active',type:'text',reply:{text:'test'},reply_when:'All',delaySeconds:0};
  const messages = [{key:{remoteJid:'test@s.whatsapp.net'}}];
  const socket = {sendMessage:async()=>{sent++;return {key:{id:'test'}};}};
  await sender.sendAutoReply(item,phone,socket,messages); assert.equal(sent,0);
  phone.autoReplyEnabled=true;
  await sender.sendAutoReply({...item,reply_status:'inactive'},phone,socket,messages); assert.equal(sent,0);
  enabled=false; await sender.sendAutoReply(item,phone,socket,messages); assert.equal(sent,0,'Recheck catches disabled device/rule');
  enabled=true; await sender.sendAutoReply(item,phone,socket,messages); assert.equal(sent,1);
  let saved;
  prisma.phone={findFirst:async()=>({id:'phone',userId:'owner'})};
  prisma.autoReply.findFirst=async()=>({id:1,userId:'owner'});
  prisma.autoReply.create=async args=>(saved=args.data);
  prisma.autoReply.update=async args=>(saved=args.data);
  const api = load('src/pages/api/auto_reply/index.ts', {'@/lib/access':{ownerScope:()=>({userId:'owner'})},'next-auth/jwt':{getToken:async()=>null},'@/lib/prisma':{prisma},'@/middleware/apiAuthMiddleware':{default:handler=>handler,__esModule:true},'@/server/campaigns/content':{publicPayload:{parse:v=>v}},'@/lib/aiPlugins':load('src/lib/aiPlugins.ts',{})}).default;
  const base = {phoneId:'phone',type_message:'text',type_keyword:'Equal',keyword:'harga',reply:'test'};
  const res={code:200,status(code){this.code=code;return this;},json(data){this.data=data;return this;},end(){}};
  await api({method:'POST',user:{id:'owner'},body:{...base}},res); assert.equal(saved.reply_status,'inactive');
  await api({method:'POST',user:{id:'owner'},body:{...base,id:1,reply_status:'active'}},res); assert.equal(saved.reply_status,'active');
  await api({method:'POST',user:{id:'owner'},body:{...base,id:1,reply_status:'inactive'}},res); assert.equal(saved.reply_status,'inactive');
  await api({method:'POST',user:{id:'owner'},body:{...base,id:1}},res); assert.equal(saved.reply_status,undefined,'Old clients preserve update status');
  await api({method:'POST',user:{id:'owner'},body:{...base,reply_status:'invalid'}},res); assert.equal(res.code,400);
  console.log('AUTO_REPLY_CONTROLS_OK: device gates normal/quoted/media, active-rule query, send recheck, create/edit status, invalid status');
})().catch(error=>{console.error(error);process.exitCode=1;});

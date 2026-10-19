const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
function load(file, stubs = {}) {
  const code = ts.transpileModule(fs.readFileSync(path.resolve(file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const mod = { exports: {} };
  new Function('require', 'module', 'exports', code)(name => {
    if (Object.hasOwn(stubs, name)) return stubs[name];
    throw Error('Unexpected dependency: ' + name);
  }, mod, mod.exports);
  return mod.exports;
}
(async () => {
  const helper = load('src/server/utils/webhookSender.ts');
  let lookups = 0;
  const socket = { signalRepository: { lidMapping: { getPNForLID: async jid => {
    lookups++;
    assert.equal(jid, '278313914388723@lid');
    return '6285231194683@s.whatsapp.net';
  } } } };
  assert.equal(await helper.webhookSender({remoteJid:'6285231194683:2@s.whatsapp.net'}, socket), '6285231194683');
  assert.equal(await helper.webhookSender({remoteJid:'278313914388723@lid',remoteJidAlt:'6285231194683@s.whatsapp.net'}, socket), '6285231194683');
  assert.equal(lookups, 0);
  const key = {remoteJid:'278313914388723@lid'};
  assert.equal(await helper.webhookSender(key, socket), '6285231194683');
  assert.equal(lookups, 1);
  assert.equal(key.remoteJid, '278313914388723@lid', 'Chat identity must remain unchanged');
  await assert.rejects(helper.webhookSender(key, {signalRepository:{lidMapping:{getPNForLID:async()=>null}}}), /UNRESOLVED/);
  const rule = {id:78,type:'webhook',reply:null,type_keyword:'Any',keyword:'',url:'https://dorun.id/api/check_user_by_phone',type_request:'GET',is_save_inbox:true,param_1:'phone',isi_param_1:'Recipient',param_2:'code',isi_param_2:'Message'};
  let request, saved;
  const stubs = {
    '../utils/mediaUrl':{mediaUrl:()=>''},
    '../utils/webhookSender':helper,
    '../../server/utils':{
      checkIdGroupFormat:()=>false,
      getImageFromWaMessage:async()=>null,
      messageKeywordTypeChecker:()=>true,
      CekValueParam:(_item, field, data)=>field === 'isi_param_1' ? data.recipient : data.message,
      runFetchGetResponse:async args=>{request=args;return {result:{result:true,message:'No Event Data',data:[]}};},
    },
    '../../services/autoReply':{getAutoReplyByPhoneId:async()=>[rule]},
    '../../services/group':{saveToGrup:async()=>{}},
    '../../services/inboxMessage':{insertWebhookToInboxMessage:async data=>{saved=data;}},
    '../libs/toBase64':{},
    '../campaigns/autoReply':{sendAutoReply:async()=>{throw Error('Unexpected outbound message');}},
  };
  const phone = {id:'device',number:'6281217357535',autoReplyEnabled:true};
  await load('src/server/events/handleMessageInEvent.ts',stubs).handleMessageInEvent({phone,_waSocket:socket,messageIn:'home',messages:[{key}],userId:'owner'});
  assert.equal(request.method,'GET');
  assert.equal(request.params.phone,'6285231194683');
  assert.equal(request.params.code,'home');
  assert.equal(request.params.recipient,'6281217357535');
  assert.equal(saved.sender,'6285231194683');
  request = null;
  await load('src/server/events/handleQuotedMessageEvent.ts',stubs).handleQuotedMessageEvent({phone,waSocket:socket,messages:[{key,message:{extendedTextMessage:{text:'home',contextInfo:{participant:'6281217357535@s.whatsapp.net'}}}}],quotedMessage:{conversation:'menu'},userId:'owner',messageType:'extendedTextMessage'});
  assert.equal(request.params.phone,'6285231194683');
  assert.equal(request.params.code,'home');
  assert.equal(saved.sender,'6285231194683');
  console.log('WEBHOOK_SENDER_OK: PN, alternate PN, LID mapping, unresolved rejection, normal and quoted webhook payloads');
})().catch(error=>{console.error(error);process.exitCode=1;});

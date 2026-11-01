'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {localWhatsApp,FALLBACK}=require('../cloud/local-whatsapp'),{memoryStore}=require('./memory-store');
const {createLocalWhatsApp}=require('../desktop/local-whatsapp');
async function fixture(){
 const db=memoryStore(),tenant={plan:'starter',subscriptionStatus:'trial',renewalDate:'2099-01-01',agentSettings:{savedReplies:'السعر | 499 جنيه'}},root=db.collection('brightAiTenants').doc('company001');await root.set(tenant);await root.collection('members').doc('owner001').set({role:'owner',active:true});
 const session={tenantId:'company001',account:'201000000000@s.whatsapp.net',sessionId:'a'.repeat(32)};
 const call=(action,extra={},uid='owner001')=>localWhatsApp({action,body:{...session,...extra},user:{uid},tenant,db,admin:{firestore:{FieldValue:{serverTimestamp:()=>new Date().toISOString()}}},plans:{starter:{limit:100}}});
 return {root,session,call};
}
test('auto replies require explicit binding, target only the inbound sender and claim once across concurrent clients',async()=>{
 const {call,root}=await fixture(),m={messageId:'M1',from:'201111111111@s.whatsapp.net',text:'السعر',timestamp:Date.now()},request={sourceMessageId:m.messageId,from:m.from};
 await call('bind');await call('inbox',m);assert.equal((await call('reply-claim',request)).status,'disabled');
 await call('bind',{autoReplyEnabled:true});await assert.rejects(call('reply-claim',request,'outsider'),e=>e.status===403);
 await assert.rejects(call('reply-claim',{...request,from:'201222222222@s.whatsapp.net'}),e=>e.status===404);
 const results=await Promise.all([call('reply-claim',request),call('reply-claim',request)]),claim=results.find(x=>x.allowed);assert.equal(results.filter(x=>x.allowed).length,1);assert.equal(claim.reply,'499 جنيه');assert.equal(claim.to,m.from);
 await assert.rejects(call('reply-result',{...request,claimId:'wrong',status:'sent',whatsappMessageId:'WA1'}),e=>e.status===409);
 await call('reply-result',{...request,claimId:claim.claimId,status:'sent',whatsappMessageId:'WA1'});assert.equal((await call('reply-claim',request)).status,'sent');
 const drafts=await root.collection('whatsappDrafts').get();assert.equal(drafts.docs[0].data().status,'sent');
});
test('unmatched messages receive honest acknowledgment; opt-out persists, stale messages and inactive companies cannot dispatch',async()=>{
 const {call,root}=await fixture();await call('bind',{autoReplyEnabled:true});
 const m={messageId:'M2',from:'201333333333@lid',text:'سؤال غير معروف',timestamp:Date.now()};await call('inbox',m);const request={sourceMessageId:m.messageId,from:m.from};assert.equal((await call('reply-claim',request)).reply,FALLBACK);
 await call('inbox',{...m,messageId:'STOP1',text:'STOP'});assert.equal((await call('reply-claim',{...request,sourceMessageId:'STOP1'})).status,'opted_out');
 await call('inbox',{...m,messageId:'AFTERSTOP'});assert.equal((await call('reply-claim',{...request,sourceMessageId:'AFTERSTOP'})).status,'opted_out');
 await call('inbox',{...m,messageId:'OLD1',from:'201444444444@s.whatsapp.net',timestamp:Date.now()-6*60000});assert.equal((await call('reply-claim',{sourceMessageId:'OLD1',from:'201444444444@s.whatsapp.net'})).status,'expired');
 await root.update({subscriptionStatus:'suspended'});await assert.rejects(call('reply-claim',request),e=>e.status===403);
});
test('unknown dispatch is never reclaimed, and a prior session cannot dispatch or report for a newer one',async()=>{
 const {call}=await fixture();await call('bind',{autoReplyEnabled:true});const m={messageId:'M3',from:'201555555555@s.whatsapp.net',text:'السعر',timestamp:Date.now()},request={sourceMessageId:m.messageId,from:m.from};await call('inbox',m);const claim=await call('reply-claim',request);assert.equal((await call('reply-claim',request)).allowed,false);
 await call('bind',{autoReplyEnabled:true,sessionId:'b'.repeat(32)});await assert.rejects(call('reply-result',{...request,claimId:claim.claimId,status:'sent',whatsappMessageId:'WA1'}),e=>e.status===409);await assert.rejects(call('reply-claim',request),e=>e.status===409);
});
test('native sender fences recipients and sessions, persists attempted dispatch before send and never repeats an ambiguous send',async()=>{
 const folder=fs.mkdtempSync(path.join(os.tmpdir(),'bright-autoreply-')),events=[],sent=[];let socket,fail=false;
 const lib={initAuthCreds:()=>({}),BufferJSON:{},proto:{},DisconnectReason:{},default:()=>socket={ev:new EventEmitter(),user:{id:'201000000000:1@s.whatsapp.net'},end(){},sendMessage:async(to,body)=>{sent.push({to,body});if(fail)throw Error('timeout');return {key:{id:'WA_ACCEPTED'}};}}};
 const bridge=createLocalWhatsApp({userData:folder,safeStorage:{isEncryptionAvailable:()=>true,encryptString:s=>Buffer.from(s),decryptString:b=>b.toString()},emit:(kind,data)=>events.push({kind,...data}),runtimeLoader:async()=>({lib,QR:{},logger:{}})});
 const start=()=>bridge.start({tenantId:'company001',uid:'owner001',origin:'https://test.example',autoReplyEnabled:true});
 const receive=id=>{socket.ev.emit('messages.upsert',{type:'notify',messages:[{key:{id,remoteJid:'201111111111@s.whatsapp.net'},messageTimestamp:Math.floor(Date.now()/1000),message:{conversation:'السعر'}}]});return {...events.at(-1),reply:'499 جنيه',claimId:'c'.repeat(32)};};
 try{
  await start();const input=receive('N1');await assert.rejects(bridge.reply({...input,from:'201999999999@s.whatsapp.net'}));assert.equal(sent.length,0);assert.equal((await bridge.reply(input)).status,'sent');await bridge.reply(input);assert.equal(sent.length,1);assert.equal(sent[0].to,input.from);
  fail=true;const ambiguous=receive('N2');assert.equal((await bridge.reply(ambiguous)).status,'unknown');await bridge.reply(ambiguous);assert.equal(sent.length,2);
  fail=false;const photo=receive('IMAGE1'),media=require('../cloud/eldalel-media')['category-materials-3d'];await assert.rejects(bridge.reply({...photo,media:{mimeType:'image/jpeg',data:'aHRtbA=='}}));assert.equal(sent.length,2);await bridge.reply({...photo,media});assert.equal(sent.length,3);assert.ok(Buffer.isBuffer(sent[2].body.image));assert.equal(sent[2].body.caption,'499 جنيه');
  bridge.stop();await assert.rejects(bridge.reply(input));await start();const restored=receive('N2');assert.equal((await bridge.reply(restored)).status,'unknown');assert.equal(sent.length,3);
 }finally{bridge.stop();fs.rmSync(folder,{recursive:true,force:true});}
});

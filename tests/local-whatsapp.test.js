'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {localWhatsApp}=require('../cloud/local-whatsapp');const {memoryStore}=require('./memory-store');
const {inbound,encryptedAuth}=require('../desktop/local-whatsapp');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
test('local sync ignores history, groups, own messages and non-text payloads',()=>{
 const now=Date.now(),m={key:{id:'ABC',remoteJid:'201000000000@s.whatsapp.net'},messageTimestamp:Math.floor(now/1000),message:{conversation:'hello'}};
 assert.equal(inbound(m,now).text,'hello');assert.equal(inbound({...m,key:{...m.key,fromMe:true}},now),null);assert.equal(inbound({...m,key:{...m.key,remoteJid:'12345@g.us'}},now),null);assert.equal(inbound({...m,messageTimestamp:Math.floor(now/1000)-10},now),null);assert.equal(inbound({...m,message:{imageMessage:{}}},now),null);
});
test('native pending queue survives encrypted restart and removes only acknowledged messages',()=>{
 const folder=fs.mkdtempSync(path.join(os.tmpdir(),'bright-sync-')),file=path.join(folder,'session.bin');
 const safeStorage={isEncryptionAvailable:()=>true,encryptString:s=>Buffer.from(s.split('').reverse().join('')),decryptString:b=>b.toString().split('').reverse().join('')};const lib={initAuthCreds:()=>({}),BufferJSON:{},proto:{Message:{AppStateSyncKeyData:{fromObject:x=>x}}}};
 try{const a=encryptedAuth({file,safeStorage,lib});const message={messageId:'123',from:'201000000000@s.whatsapp.net',text:'PRIVATE-TEST-MESSAGE'};a.enqueue(message);assert.equal(fs.readFileSync(file).includes(Buffer.from(message.text)),false);const restored=encryptedAuth({file,safeStorage,lib});assert.equal(restored.pending()[0].text,message.text);restored.ack(message);assert.equal(encryptedAuth({file,safeStorage,lib}).pending().length,0);assert.throws(()=>encryptedAuth({file,safeStorage:{isEncryptionAvailable:()=>false},lib}));}finally{fs.rmSync(folder,{recursive:true,force:true});}
});
test('tenant binding, fenced sessions, duplicate inbound events, shared quota and draft generation',async()=>{
 const db=memoryStore(),root=db.collection('brightAiTenants').doc('company001'),tenant={plan:'starter',subscriptionStatus:'trial',renewalDate:'2099-01-01',agentSettings:{savedReplies:'السعر | 499 جنيه'}};await root.set(tenant);await root.collection('members').doc('owner001').set({role:'owner',active:true});
 const admin={firestore:{FieldValue:{serverTimestamp:()=>new Date().toISOString()}}},plans={starter:{limit:2}},body={tenantId:'company001',account:'201000000000@s.whatsapp.net',sessionId:'a'.repeat(32)};
 const call=(action,extra={},uid='owner001')=>localWhatsApp({action,body:{...body,...extra},user:{uid},tenant,db,admin,plans});
 await assert.rejects(call('bind',{},'intruder'),e=>e.status===403);await call('bind');
 const message={messageId:'ABC',from:'201111111111@s.whatsapp.net',text:'السعر',timestamp:Date.now()};
 const results=await Promise.all([call('inbox',message),call('inbox',message)]);assert.equal(results.filter(x=>x.duplicate).length,1);assert.equal(results[0].sent,false);
 const draft=await root.collection('whatsappDrafts').doc(results[0].draftId).get();assert.equal(draft.data().reply,'499 جنيه');assert.equal(draft.data().source,'local_qr');
 await call('bind',{sessionId:'b'.repeat(32)});await assert.rejects(call('inbox',{...message,messageId:'NEW'}),e=>e.status===409);
 await call('inbox',{...message,messageId:'NEW',sessionId:'b'.repeat(32)});await assert.rejects(call('inbox',{...message,messageId:'THIRD',sessionId:'b'.repeat(32)}),e=>e.status===429);
 await assert.rejects(call('inbox',{...message,from:'123456@g.us'}),e=>e.status===400);
 const second=db.collection('brightAiTenants').doc('company002');await second.set(tenant);await second.collection('members').doc('owner001').set({role:'owner',active:true});await assert.rejects(call('bind',{tenantId:'company002'}),e=>e.status===409);
 await second.collection('members').doc('owner002').set({role:'owner',active:true});assert.equal((await call('bind',{tenantId:'company002'},'owner002')).bound,true);
});

test('native socket cannot deliver a prior company event after stopping or switching tenants',async()=>{
 const {createLocalWhatsApp}=require('../desktop/local-whatsapp'),{EventEmitter}=require('node:events');const folder=fs.mkdtempSync(path.join(os.tmpdir(),'bright-session-')),sockets=[],events=[];
 const lib={initAuthCreds:()=>({}),BufferJSON:{},proto:{},DisconnectReason:{restartRequired:515,loggedOut:401},default:()=>{const sock={ev:new EventEmitter(),user:{id:'201000000000:1@s.whatsapp.net'},end(){}};sockets.push(sock);return sock;}};
 const bridge=createLocalWhatsApp({userData:folder,safeStorage:{isEncryptionAvailable:()=>true,encryptString:s=>Buffer.from(s),decryptString:b=>b.toString()},emit:(type,event)=>events.push({type,...event}),runtimeLoader:async()=>({lib,QR:{toDataURL:async()=>''},logger:{}})});
 try{await bridge.start({tenantId:'company001',uid:'owner001',origin:'https://console.test'});const first=sockets[0];await bridge.start({tenantId:'company002',uid:'owner001',origin:'https://console.test'});const count=events.length;first.ev.emit('messages.upsert',{type:'notify',messages:[{key:{id:'STALE',remoteJid:'201111111111@s.whatsapp.net'},messageTimestamp:Math.floor(Date.now()/1000),message:{conversation:'old company'}}]});assert.equal(events.length,count);bridge.stop();sockets[1].ev.emit('connection.update',{connection:'open'});assert.equal(events.length,count);}finally{bridge.stop();fs.rmSync(folder,{recursive:true,force:true});}
});

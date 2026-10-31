'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),http=require('node:http'),crypto=require('node:crypto');
const {makeService}=require('../cloud/service'),{memoryStore}=require('./memory-store');
test('verified Meta webhook retries are atomic and late messages cannot open reply window',async t=>{
 const db=memoryStore(),tenant=db.collection('brightAiTenants').doc('company001');await tenant.set({automation:{mode:'manual_review'}});await db.collection('brightAiWhatsappChannels').doc('123456789').set({tenantId:'company001'});
 const server=http.createServer(makeService({db,admin:{firestore:{FieldValue:{serverTimestamp:()=>new Date().toISOString()}}},auth:{},allowedOrigins:new Set()}));await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));process.env.WA_APP_SECRET='test-secret';
 const sentAt=Math.floor(Date.now()/1000)-48*60*60;
 const body=JSON.stringify({entry:[{changes:[{value:{metadata:{phone_number_id:'123456789'},messages:[{id:'wamid.test001',from:'201000000000',type:'text',timestamp:String(sentAt),text:{body:'عايز أطلب الخدمة'}}]}}]}]});
 const signature='sha256='+crypto.createHmac('sha256','test-secret').update(body).digest('hex'),url='http://127.0.0.1:'+server.address().port+'/webhooks/whatsapp';
 const request=sig=>fetch(url,{method:'POST',headers:{'content-type':'application/json','x-hub-signature-256':sig},body});
 assert.equal((await request('bad')).status,403);assert.equal((await tenant.collection('whatsappInbox').get()).size,0);
 assert.equal((await request(signature)).status,200);assert.equal((await request(signature)).status,200);
 const messages=await tenant.collection('whatsappInbox').get();assert.equal(messages.size,1);assert.equal(messages.docs[0].data().receivedAtMillis,sentAt*1000);
 assert.equal((await tenant.collection('automationTasks').get()).size,1);
 const {withinServiceWindow}=require('../cloud/whatsapp-send');assert.equal(withinServiceWindow(messages.docs[0].data().receivedAtMillis),false);
});

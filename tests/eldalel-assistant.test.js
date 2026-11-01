'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),http=require('node:http');
const {normalize,answerEldalel}=require('../cloud/eldalel-assistant');
const {createSavedReplyAgent,parseRules}=require('../cloud/saved-replies');
const {createKnowledgeLoader}=require('../cloud/eldalel-knowledge');
const {localWhatsApp}=require('../cloud/local-whatsapp'),{memoryStore}=require('./memory-store'),{makeService}=require('../cloud/service');
const facts={available:true,plans:[{id:'basic',name:'أساسي',price:200,posts:5},{id:'company',name:'شركات',price:1000,posts:30}]};
const tenant={plan:'starter',subscriptionStatus:'trial',renewalDate:'2099-01-01',agentSettings:{assistantProfile:'eldalel',savedReplies:''}};
const agent=createSavedReplyAgent({knowledgeLoader:async()=>facts});
test('Arabic variants and small spelling mistakes preserve service intent without inventing prices',async()=>{
 assert.equal(normalize('المتاحة'),normalize('المتاحه'));assert.equal(normalize('مساحة ١٠٠ متر'),normalize('مساحه 100 متر'));
 for(const text of ['الباقات المتاحه','الباقات المتاحة','الباكات','باقات الموردين','باقه الشركات']){const a=await agent({message:text,tenant});assert.match(a.reply,/جنيه/);assert.match(a.reply,/سنو|السنة|سنة/);assert.doesNotMatch(a.reply,/499|999|1999/);}
 for(const text of ['عايز التشطببات بكام','تشطيب شقه ١٠٠ متر','اسعار التشطيبات'])assert.equal((await agent({message:text,tenant})).topic,'finishing');
 for(const text of ['الشركات المتاحة','محتاج موردين','انشاء موقع الكترونى','متجر الكتروني بكام']){const a=await agent({message:text,tenant});assert.equal(a.requiresReview,false);assert.ok(a.reply.length<1000);}
 const web=await agent({message:'متجر الكتروني بكام',tenant});assert.doesNotMatch(web.reply,/2499|200 جنيه|1000 جنيه/);assert.match(web.reply,/تفاصيل|محتاج|نشاط/);
 const generic=await agent({message:'باقات الموردين',tenant:{...tenant,agentSettings:{}}});assert.equal(generic.requiresReview,true);
});
test('finishing follow-up remembers only this contact context and asks for missing information',()=>{
 const a=answerEldalel({message:'عايز تشطيب شقة ١٠٠ متر',knowledge:facts});assert.equal(a.conversation.slots.area,'100');
 const b=answerEldalel({message:'في القاهرة على الطوب',context:a.conversation,knowledge:facts});assert.match(b.reply,/100 متر/);assert.match(b.reply,/القاهرة/);assert.match(b.reply,/على الطوب/);assert.doesNotMatch(b.reply,/المساحة كام|أنهي محافظة/);
 const c=answerEldalel({message:'عايز متجر الكتروني',context:b.conversation,knowledge:facts});assert.equal(c.topic,'websites');assert.equal(c.conversation.slots.area,undefined);
});
test('images are honest directory illustrations; requests for website portfolio never invent examples',async()=>{
 for(const [message,id] of [['صور التشطيبات','category-craft-3d'],['وريني صور الموردين','category-materials-3d'],['صور الشركات','category-engineering-3d']]){const a=await agent({message,tenant});assert.equal(a.mediaId,id);assert.match(a.reply,/صورة|صور/);const asset=require('../cloud/eldalel-media')[id];assert.ok(asset.sourceUrl.startsWith('https://eldalel-elshamel.online/'));assert.equal(Buffer.from(asset.data,'base64').subarray(0,3).toString('hex'),'ffd8ff');assert.ok(a.reply.length<=1000);}
 assert.equal((await agent({message:'صور مواقع نفذتوها',tenant})).mediaId,undefined);
 assert.match((await agent({message:'انت انسان',tenant})).reply,/مساعد/);
});
test('public pricing loader uses masked read-only configuration, caches, and fails without invented fallback prices',async()=>{
 let calls=0;const fields={};for(const name of ['planPrices','postLimits'])fields[name]={mapValue:{fields:Object.fromEntries(['starter','basic','premium','vip','company','elite'].map((id,i)=>[id,{integerValue:String(name==='planPrices'?(i+1)*100:i*5)}]))}};
 const load=createKnowledgeLoader(async(url,options)=>{calls++;assert.match(url,/mask.fieldPaths=planPrices/);assert.equal(options.headers,undefined);return {ok:true,text:async()=>JSON.stringify({fields})};});assert.equal((await load()).plans.length,6);await load();assert.equal(calls,1);
 const failed=createKnowledgeLoader(async()=>({ok:false}));assert.equal((await failed()).available,false);assert.match(answerEldalel({message:'الباقات',knowledge:await failed()}).reply,/مش قادر أتأكد/);
});
test('library accepts 200 replies, rejects 201 and HTTP save no longer fails at the old 10KB body limit',async t=>{
 const savedReplies=Array.from({length:200},(_,i)=>`سؤال مخصص ${i} | ${'إجابة تفصيلية '.repeat(8)}`).join('\n');assert.equal(parseRules(savedReplies).length,200);assert.throws(()=>parseRules(savedReplies+'\nسؤال زيادة | إجابة'));
 const db=memoryStore(),root=db.collection('brightAiTenants').doc('company001');await root.set(tenant);await root.collection('members').doc('owner001').set({active:true,role:'owner'});
 const server=http.createServer(makeService({db,auth:{verifyIdToken:async()=>({uid:'owner001'})},admin:{firestore:{FieldValue:{serverTimestamp:()=>new Date()}}}}));await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));
 const r=await fetch('http://127.0.0.1:'+server.address().port+'/api/company/agent',{method:'POST',headers:{Authorization:'Bearer test','Content-Type':'application/json'},body:JSON.stringify({tenantId:'company001',savedReplies,assistantProfile:'eldalel'})});assert.equal(r.status,200);assert.equal((await r.json()).settings.assistantProfile,'eldalel');
});
test('WhatsApp persists per-contact context and exposes only approved image attachments in a dispatch claim',async()=>{
 const db=memoryStore(),root=db.collection('brightAiTenants').doc('company001');await root.set(tenant);await root.collection('members').doc('owner001').set({active:true,role:'owner'});
 const session={tenantId:'company001',account:'201000000000@s.whatsapp.net',sessionId:'a'.repeat(32)},call=(action,b)=>localWhatsApp({action,body:{...session,...b},user:{uid:'owner001'},tenant,db,admin:{firestore:{FieldValue:{serverTimestamp:()=>new Date()}}},plans:{starter:{limit:20}}});await call('bind',{autoReplyEnabled:true});
 const message={from:'201111111111@s.whatsapp.net',timestamp:Date.now()};await call('inbox',{...message,messageId:'CTX1',text:'عايز تشطيب 100 متر'});const second=await call('inbox',{...message,messageId:'CTX2',text:'في القاهرة على الطوب'});assert.match((await root.collection('whatsappDrafts').doc(second.draftId).get()).data().reply,/100 متر/);
 const photo=await call('inbox',{...message,messageId:'PHOTO1',text:'وريني صور التشطيبات'});const claim=await call('reply-claim',{from:message.from,sourceMessageId:'PHOTO1'});assert.equal(claim.media.mimeType,'image/jpeg');assert.ok(claim.media.data.length>1000);assert.equal(claim.to,message.from);assert.equal((await root.collection('whatsappDrafts').doc(photo.draftId).get()).data().mediaId,'category-craft-3d');
 const other=await call('inbox',{...message,from:'201222222222@s.whatsapp.net',messageId:'OTHER',text:'وبكام'});assert.doesNotMatch((await root.collection('whatsappDrafts').doc(other.draftId).get()).data().reply,/100 متر/);
});

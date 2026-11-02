'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),http=require('node:http');
const {profiles,rankTrade,answerTrade}=require('../cloud/trade-assistant'),{createSavedReplyAgent,parseRules}=require('../cloud/saved-replies');
const {makeService}=require('../cloud/service'),{memoryStore}=require('./memory-store');
test('all 399 trade question forms select their intended path and fit reply limits',()=>{
 for(const [profile,p]of Object.entries(profiles)){
 assert.equal(new Set(p.intents.map(i=>i.id)).size,p.intents.length);
 assert.equal(parseRules(p.intents.map(i=>i.aliases[0]+' | '+i.reply).join('\n')).length,p.intents.length);
 for(const i of p.intents){assert.ok(i.detail.length<=1000);for(const message of i.aliases){assert.equal(rankTrade(profile,message)[0]?.intent.id,i.id,message);const a=answerTrade({profile,message});assert.ok(a.reply.length<=1000);assert.equal(a.requiresReview,false);assert.doesNotMatch(a.reply,/2499|3000|4000|5000|6000|10%/);}}
 }
});
test('finishing dialogue remembers supplied area, city and condition without repeating missing questions',()=>{
 const profile='khaled_design';let a=answerTrade({profile,message:'عايز تصميم شقة ١٢٠ متر'});
 a=answerTrade({profile,message:'في القاهرة على الطوب',context:a.conversation});assert.match(a.reply,/120 متر/);assert.match(a.reply,/القاهرة/);assert.doesNotMatch(a.reply,/المساحة كام|أنهي محافظة/);
 a=answerTrade({profile,message:'فيدني اكتر',context:a.conversation});assert.ok(a.reply.length>50);
 a=answerTrade({profile,message:'تصميم واجهة بكام',context:a.conversation});assert.equal(a.topic,'facade');assert.match(a.reply,/سعر|تكلفة|التكلفة/);assert.doesNotMatch(a.reply,/500 جنيه/);
 assert.doesNotMatch(answerTrade({profile,message:'وضح اكتر',context:{...a.conversation,profile:'eldalel_suppliers'}}).reply,/120 متر/);
 assert.match(answerTrade({profile,message:'مش عايز تصميم'}).reply,/مش هنعتبر/);
});
test('suppliers preserve quantities, use approved custom prices only for their company and never mix craftsman plans',async()=>{
 const agent=createSavedReplyAgent({knowledgeLoader:async()=>{throw Error('supplier must not read craftsman prices');}});
 const tenant={agentSettings:{assistantProfile:'eldalel',savedReplies:''}};
 let a=await agent({tenant,message:'عايز مورد سيراميك'});a=await agent({tenant,message:'200 متر في الجيزة',context:a.conversation});assert.match(a.reply,/200 متر/);assert.match(a.reply,/الجيزة/);assert.doesNotMatch(a.reply,/الكمية ووحدة|لأنهي محافظة/);
 for(const message of ['باقات الموردين','باقه الشركات']){const b=await agent({tenant,message});assert.doesNotMatch(b.reply,/600|1000|2000|6000|جنيه/);assert.equal(b.conversation.profile,'eldalel_suppliers');}
 const custom={agentSettings:{assistantProfile:'khaled_design',savedReplies:'السعر المعتمد | 123 جنيه وفق عرض معتمد'}};
 assert.match((await agent({tenant:custom,message:'السعر المعتمد'})).reply,/123/);
 assert.doesNotMatch((await agent({tenant:{agentSettings:{assistantProfile:'khaled_design'}},message:'السعر المعتمد'})).reply,/123/);
});
test('authenticated presets save and preview both trade profiles without sends or quota use',async t=>{
 const db=memoryStore(),root=db.collection('brightAiTenants').doc('company001');await root.set({plan:'starter',subscriptionStatus:'trial',renewalDate:'2099-01-01'});await root.collection('members').doc('owner001').set({active:true,role:'owner'});
 const server=http.createServer(makeService({db,auth:{verifyIdToken:async uid=>({uid})},admin:{firestore:{FieldValue:{serverTimestamp:()=>new Date()}}}}));await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));
 async function api(url,body,uid='owner001'){const r=await fetch('http://127.0.0.1:'+server.address().port+url,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+uid,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,data:await r.json()};}
 for(const [path,profile]of [['khaled-design','khaled_design'],['eldalel-suppliers','eldalel_suppliers']]){
 const preset=await api('/api/company/agent-presets/'+path+'?tenantId=company001');assert.equal(preset.status,200);assert.equal(preset.data.paths,profiles[profile].intents.length);
 assert.equal((await api('/api/company/agent',{tenantId:'company001',...preset.data.settings})).data.settings.assistantProfile,profile);
 const a=await api('/api/company/replies/preview',{tenantId:'company001',text:profile==='khaled_design'?'تصميم داخلي':'باقات الموردين'});const b=await api('/api/company/replies/preview',{tenantId:'company001',text:'فيدني اكتر',context:a.data.conversation});assert.equal(b.data.sent,false);assert.equal(b.data.conversation.profile,profile);
 assert.equal((await api('/api/company/agent-presets/'+path+'?tenantId=company001',null,'outsider')).status,403);
 }assert.equal((await root.collection('usage').get()).size,0);
});

test('native WhatsApp drafts keep finishing context per sender, never across contacts',async()=>{
 const {localWhatsApp}=require('../cloud/local-whatsapp'),db=memoryStore(),root=db.collection('brightAiTenants').doc('company001');
 const tenant={plan:'starter',subscriptionStatus:'trial',renewalDate:'2099-01-01',agentSettings:{assistantProfile:'khaled_design'}};await root.set(tenant);await root.collection('members').doc('owner001').set({active:true,role:'owner'});
 const session={tenantId:'company001',account:'201000000000@s.whatsapp.net',sessionId:'c'.repeat(32)};
 const call=(action,body)=>localWhatsApp({action,body:{...session,...body},user:{uid:'owner001'},tenant,db,admin:{firestore:{FieldValue:{serverTimestamp:()=>new Date()}}},plans:{starter:{limit:20}}});await call('bind',{autoReplyEnabled:false});
 const m={from:'201111111111@s.whatsapp.net',timestamp:Date.now()};await call('inbox',{...m,messageId:'TRADE1',text:'عايز تصميم شقة 120 متر'});const second=await call('inbox',{...m,messageId:'TRADE2',text:'في القاهرة على الطوب'});assert.match((await root.collection('whatsappDrafts').doc(second.draftId).get()).data().reply,/120 متر/);
 const other=await call('inbox',{...m,from:'201222222222@s.whatsapp.net',messageId:'TRADE3',text:'بكام'});assert.doesNotMatch((await root.collection('whatsappDrafts').doc(other.draftId).get()).data().reply,/120 متر|القاهرة/);
});

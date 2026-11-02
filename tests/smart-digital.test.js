'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),http=require('node:http');
const {answerSmartDigital,ranked,intents}=require('../cloud/smart-digital-assistant');
const {createSavedReplyAgent,parseRules}=require('../cloud/saved-replies');
const {makeService}=require('../cloud/service'),{memoryStore}=require('./memory-store'),{localWhatsApp}=require('../cloud/local-whatsapp');
const tenant={plan:'starter',subscriptionStatus:'trial',renewalDate:'2099-01-01',agentSettings:{assistantProfile:'smart_digital',savedReplies:''}};
test('every written Egyptian question form selects its own path; replies fit native WhatsApp text limits',()=>{
 assert.equal(new Set(intents.map(i=>i.id)).size,intents.length);
 for(const i of intents){assert.ok(i.reply.length<1000);assert.ok(i.detail.length<1000);for(const alias of i.aliases){assert.equal(ranked(alias)[0]?.intent.id,i.id,alias);const a=answerSmartDigital({message:alias});assert.equal(a.requiresReview,false);assert.ok(a.reply.length<=1000,alias);assert.doesNotMatch(a.reply,/eldalel|الدليل الشامل|خالد ديزاين|499 جنيه|999 جنيه|1999 جنيه/);}}
 assert.equal(parseRules(intents.map(i=>i.aliases[0]+' | '+i.reply).join('\n')).length,intents.length);
});
test('natural Egyptian phrasing, spelling variants and punctuation work beyond the literal alias strings',()=>{
 const cases=[['ممكن اعمل متجر الكترونى عندكم؟','store'],['كنت عايز موقع لشركتي لو ينفع','website'],['عايز اعرف استضافه الموقع ايه','hosting'],['إيه أحسن موقع ولا متجر؟','website_store_compare'],['ممكن تعملوا اداره صفحات لينا','social'],['طب ميزانيه الاعلان كام؟','ad_budget'],['يا باشا عايز لوجو','logo'],['طب هيشتغل على الموبايل ولا ايه','mobile'],['محتاج فيديوهات قصيره للصفحه','reels'],['الموقع واقع ومش عارف اعمل ايه','website_down']];
 for(const [message,id] of cases)assert.equal(ranked(message)[0]?.intent.id,id,message);
});
test('clarifications, benefits, negotiation, budget and explicit topic switches preserve correct context',()=>{
 let a=answerSmartDigital({message:'عايز متجر الكتروني'});const start=a.conversation;
 a=answerSmartDigital({message:'طب فيدني اكتر',context:a.conversation});assert.match(a.reply,/الأقسام|المقاسات/);assert.equal(a.topic,'stores');
 a=answerSmartDigital({message:'اعملها ليه',context:a.conversation});assert.match(a.reply,/المنتجات|الطلب/);
 a=answerSmartDigital({message:'طب بكام',context:a.conversation});assert.match(a.reply,/بخصوص المتجر/);assert.doesNotMatch(a.reply,/2499|1999/);
 a=answerSmartDigital({message:'غالي عليا',context:a.conversation});assert.match(a.reply,/ميزانيتك/);assert.match(a.reply,/المتجر/);
 a=answerSmartDigital({message:'الموقع بكام وبيخلص امتى',context:a.conversation});assert.equal(a.topic,'websites');assert.match(a.reply,/ميعاد التسليم/);assert.match(a.reply,/التكلفة/);assert.doesNotMatch(a.reply,/بخصوص المتجر/);
 const stale=answerSmartDigital({message:'وضح اكتر',context:{...start,at:Date.now()-25*3600000}});assert.match(stale.reply,/قولّي الخدمة/);
 const other=answerSmartDigital({message:'وضح اكتر',context:{...start,profile:'eldalel'}});assert.match(other.reply,/قولّي الخدمة/);
 assert.match(answerSmartDigital({message:'مش عايز موقع',context:start}).reply,/مش هنعتبر ده طلب/);
});
test('budgets, guarantees, payments and support never invent approved commitments or outcomes',()=>{
 for(const message of ['السعر','التجديد بكام','فيه تقسيط','هستلم امتى','هتجيبوا كام عميل','ارجع فلوسي','طلبي وصل لفين','عايز اشتكي']){const a=answerSmartDigital({message});assert.doesNotMatch(a.reply,/تم (?:التحويل|التنفيذ|الحجز|الخصم|الاسترداد|إنشاء تذكرة)|(?:^|\n)نضمن.*مبيع|2499|٣ أيام/);assert.equal(a.mode,'saved_reply');}
 assert.match(answerSmartDigital({message:'ميزانية الاعلان'}).reply,/أتعاب|إدارة/);
 assert.match(answerSmartDigital({message:'باقاتكم'}).reply,/مدة معتمدة|سعر/);
});
test('company profiles remain isolated, custom approved exact replies override only their own tenant',async()=>{
 const agent=createSavedReplyAgent({knowledgeLoader:async()=>{throw Error('Smart Digital must not read directory prices');}});
 assert.match((await agent({message:'عايز متجر',tenant})).reply,/المنتجات/);
 assert.equal((await agent({message:'عايز متجر',tenant:{...tenant,agentSettings:{}}})).requiresReview,true);
 const custom={...tenant,agentSettings:{assistantProfile:'smart_digital',savedReplies:'سعر العرض الخاص | 123 جنيه وفق عرض الشركة المعتمد'}};
 assert.match((await agent({message:'سعر العرض الخاص',tenant:custom})).reply,/123 جنيه/);assert.doesNotMatch((await agent({message:'سعر العرض الخاص',tenant})).reply,/123 جنيه/);
});
test('authenticated preset/save/preview API carries multi-turn context without customer sends or quota use',async t=>{
 const db=memoryStore(),root=db.collection('brightAiTenants').doc('company001');await root.set(tenant);await root.collection('members').doc('owner001').set({active:true,role:'owner'});
 const server=http.createServer(makeService({db,auth:{verifyIdToken:async uid=>({uid})},admin:{firestore:{FieldValue:{serverTimestamp:()=>new Date()}}}}));await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));
 async function api(url,body,uid='owner001'){const r=await fetch('http://127.0.0.1:'+server.address().port+url,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+uid,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,data:await r.json()};}
 const preset=await api('/api/company/agent-presets/smart-digital?tenantId=company001');assert.equal(preset.status,200);assert.equal(preset.data.paths,intents.length);assert.equal(parseRules(preset.data.settings.savedReplies).length,intents.length);
 assert.equal((await api('/api/company/agent',{tenantId:'company001',...preset.data.settings})).data.settings.assistantProfile,'smart_digital');
 const first=await api('/api/company/replies/preview',{tenantId:'company001',text:'عايز متجر الكتروني'});const second=await api('/api/company/replies/preview',{tenantId:'company001',text:'فيدني اكتر',context:first.data.conversation});assert.match(second.data.reply,/الأقسام|المقاسات/);assert.equal(second.data.sent,false);assert.equal((await root.collection('usage').get()).size,0);
 assert.equal((await api('/api/company/agent-presets/smart-digital?tenantId=company001',null,'outsider')).status,403);
});
test('local WhatsApp drafts keep Smart Digital follow-ups per sender and per company',async()=>{
 const db=memoryStore(),root=db.collection('brightAiTenants').doc('company001');await root.set(tenant);await root.collection('members').doc('owner001').set({active:true,role:'owner'});
 const session={tenantId:'company001',account:'201000000000@s.whatsapp.net',sessionId:'b'.repeat(32)};
 const call=(action,body)=>localWhatsApp({action,body:{...session,...body},user:{uid:'owner001'},tenant,db,admin:{firestore:{FieldValue:{serverTimestamp:()=>new Date()}}},plans:{starter:{limit:20}}});await call('bind',{autoReplyEnabled:false});
 const m={from:'201111111111@s.whatsapp.net',timestamp:Date.now()};await call('inbox',{...m,messageId:'SMART1',text:'عايز متجر'});const second=await call('inbox',{...m,messageId:'SMART2',text:'السعر'});assert.match((await root.collection('whatsappDrafts').doc(second.draftId).get()).data().reply,/بخصوص المتجر/);
 const other=await call('inbox',{...m,from:'201222222222@s.whatsapp.net',messageId:'SMART3',text:'السعر'});assert.doesNotMatch((await root.collection('whatsappDrafts').doc(other.draftId).get()).data().reply,/بخصوص المتجر/);
});

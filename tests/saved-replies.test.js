'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),http=require('node:http');
const {createSavedReplyAgent,parseRules}=require('../cloud/saved-replies');
const {makeService}=require('../cloud/service');const {memoryStore}=require('./memory-store');
test('saved replies normalize Arabic, keep word boundaries and hand off ambiguity',async()=>{
 const agent=createSavedReplyAgent(),tenant={agentSettings:{savedReplies:'الأسعار | راجع قائمة أسعار الشركة\nمواعيد العمل | من 9 إلى 5',greeting:'أهلًا بشركتنا'}};
 assert.equal((await agent({tenant,message:'ممكن أعرف الاَسعار؟'})).reply,'راجع قائمة أسعار الشركة');
 assert.equal((await agent({tenant,message:'الأسعار ومواعيد العمل'})).requiresReview,true);
 assert.equal((await agent({tenant,message:'خصم غير معلن'})).mode,'saved_review');
 assert.equal((await agent({tenant:{agentSettings:{savedReplies:'سعر | 100'}},message:'اسعار'})).requiresReview,true);
 assert.equal((await agent({tenant,message:'السلام عليكم'})).reply,'أهلًا بشركتنا');
 assert.equal((await agent({tenant:{agentSettings:{}},message:'الأسعار'})).requiresReview,true);
 assert.throws(()=>parseRules('سعر | 100\nسعر | 200'));
 assert.throws(()=>parseRules('x'.repeat(18001)));
});
test('saved reply preview uses stored tenant rules, denies outsiders and does not spend quota',async t=>{
 const db=memoryStore(),tenant=db.collection('brightAiTenants').doc('company001');
 await tenant.set({agentSettings:{savedReplies:'السعر | 499 جنيه'}});await tenant.collection('members').doc('owner001').set({active:true,role:'owner'});
 const server=http.createServer(makeService({db,admin:{firestore:{FieldValue:{serverTimestamp:()=>''}}},auth:{verifyIdToken:async uid=>({uid})}}));
 await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));
 const call=async token=>{const r=await fetch('http://127.0.0.1:'+server.address().port+'/api/company/replies/preview',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({tenantId:'company001',text:'السعر',savedReplies:'السعر | forged'})});return {status:r.status,body:await r.json()}};
 const ok=await call('owner001');assert.equal(ok.status,200);assert.equal(ok.body.reply,'499 جنيه');assert.equal(ok.body.sent,false);assert.equal((await call('outsider')).status,403);assert.equal([...db.data.keys()].some(k=>k.includes('/usage/')||k.includes('/conversations/')),false);
});

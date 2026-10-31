'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');const http=require('node:http');const crypto=require('node:crypto');
const {makeService,PLANS}=require('../cloud/service');const {memoryStore}=require('./memory-store');const {signature}=require('../cloud/paymob');
test('HTTP tenant, role, quota, session, webhook and sandbox boundaries',async t=>{
 const db=memoryStore(),admin={firestore:{FieldValue:{serverTimestamp:()=>new Date().toISOString()}}};let calls=0;
 const auth={verifyIdToken:async token=>{if(token==='expired')throw Error('expired');return {uid:token,brightSuperAdmin:token==='superuser'};},getUser:async uid=>({uid})};
 const handler=makeService({db,admin,auth,allowedOrigins:new Set(['https://console.test']),agent:async()=>{calls++;return {reply:'أهلًا بيك',mode:'openai'};}});
 const server=http.createServer(handler);await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));
 const base='http://127.0.0.1:'+server.address().port;
 async function request(path,{token,body,headers={}}={}){const r=await fetch(base+path,{method:body?'POST':'GET',headers:{...(token?{Authorization:'Bearer '+token}:{}),...(body?{'Content-Type':'application/json'}:{}),...headers},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,data:await r.json()};}
 const tenant=db.collection('brightAiTenants').doc('company001');
 await tenant.set({name:'شركة الاختبار',plan:'starter',subscriptionStatus:'active',renewalDate:'2099-01-01',widgetId:'widget0001',memberUids:['owner001','staff001']});
 await tenant.collection('members').doc('owner001').set({active:true,role:'owner'});await tenant.collection('members').doc('staff001').set({active:true,role:'staff'});
 await t.test('rejects missing and invalid sessions',async()=>{assert.equal((await request('/api/company?tenantId=company001')).status,401);assert.equal((await request('/api/company?tenantId=company001',{token:'expired'})).status,401);});
 await t.test('cross-tenant access denied',async()=>assert.equal((await request('/api/company?tenantId=company001',{token:'other001'})).status,403));
 await t.test('company discovery only returns memberships',async()=>{assert.equal((await request('/api/me/companies',{token:'owner001'})).data.companies.length,1);assert.equal((await request('/api/me/companies',{token:'other001'})).data.companies.length,0);});
 await t.test('staff cannot alter AI or membership',async()=>{assert.equal((await request('/api/company/agent',{token:'staff001',body:{tenantId:'company001',services:'x'}})).status,403);assert.equal((await request('/api/company/members',{token:'staff001',body:{tenantId:'company001',uid:'other001',role:'admin',active:true}})).status,403);});
 await t.test('owner can add then revoke employee immediately',async()=>{const body={tenantId:'company001',uid:'other001',role:'staff',active:true};assert.equal((await request('/api/company/members',{token:'owner001',body})).status,200);assert.equal((await request('/api/company?tenantId=company001',{token:'other001'})).status,200);assert.equal((await request('/api/company/members',{token:'owner001',body:{...body,active:false}})).status,200);assert.equal((await request('/api/company?tenantId=company001',{token:'other001'})).status,403);});
 await t.test('owner role cannot be overwritten',async()=>assert.equal((await request('/api/company/members',{token:'owner001',body:{tenantId:'company001',uid:'owner001',role:'staff',active:false}})).status,403));
 await t.test('non-admin cannot create companies; admin creates suspended isolated company',async()=>{const body={name:'شركة جديدة',ownerUid:'owner002',plan:'pro'};assert.equal((await request('/api/admin/companies',{token:'owner001',body})).status,403);const r=await request('/api/admin/companies',{token:'superuser',body});assert.equal(r.status,201);const created=await db.collection('brightAiTenants').doc(r.data.tenantId).get();assert.equal(created.data().subscriptionStatus,'suspended');assert.deepEqual(created.data().memberUids,['owner002']);assert.equal(db.data.has('tenants/'+r.data.tenantId),false);});
 await t.test('invalid calendar date rejected',async()=>assert.equal((await request('/api/admin/subscription',{token:'superuser',body:{tenantId:'company001',plan:'starter',status:'active',renewalDate:'2026-02-31'}})).status,400));
 await t.test('CORS blocks untrusted origins',async()=>assert.equal((await request('/api/company?tenantId=company001',{token:'owner001',headers:{Origin:'https://evil.test'}})).status,403));
 await t.test('customer sends disabled even with an authenticated owner',async()=>{delete process.env.BRIGHT_ALLOW_CUSTOMER_SENDS;assert.equal((await request('/api/company/whatsapp/reply',{token:'owner001',body:{tenantId:'company001'}})).status,403);});
 const usage=tenant.collection('usage').doc(new Date().toISOString().slice(0,7));
 await t.test('concurrent website calls cannot exceed monthly quota',async()=>{await usage.set({reserved:499});const r=await Promise.all(Array.from({length:4},()=>request('/api/public/message',{body:{widgetId:'widget0001',text:'السعر كام؟'}})));assert.equal(r.filter(x=>x.status===200).length,1);assert.equal(r.filter(x=>x.status===429).length,3);assert.equal(calls,1);assert.equal((await usage.get()).data().reserved,500);});
 await t.test('WhatsApp drafts use the SAME quota as website',async()=>{await tenant.collection('whatsappInbox').doc('message001').set({text:'السعر كام',receivedAtMillis:Date.now()});const r=await request('/api/company/whatsapp/draft',{token:'owner001',body:{tenantId:'company001',messageId:'message001'}});assert.equal(r.status,429);assert.equal(calls,1);});
 await t.test('missing expiry cannot grant unlimited access',async()=>{await tenant.update({renewalDate:null});assert.equal((await request('/api/public/message',{body:{widgetId:'widget0001',text:'أهلا'}})).status,403);await tenant.update({renewalDate:'2099-01-01'});});
 await t.test('payments locked without sandbox config',async()=>{delete process.env.BRIGHT_PAYMENTS_MODE;assert.equal((await request('/api/company/checkout',{token:'owner001',body:{tenantId:'company001'}})).status,503);});
 await t.test('signed sandbox webhook is idempotent and never activates subscription',async()=>{
  Object.assign(process.env,{BRIGHT_PAYMENTS_MODE:'sandbox',PAYMOB_SECRET_KEY:'sk_test_fake',PAYMOB_PUBLIC_KEY:'pk_test_fake',PAYMOB_INTEGRATION_ID:'123',PAYMOB_HMAC_SECRET:'test-secret',BRIGHT_PUBLIC_URL:'https://console.test'});
  const invoice=db.collection('brightAiInvoices').doc('invoice001');await invoice.set({tenantId:'company001',providerOrderId:'789',amountMinor:49900,status:'pending'});
  const obj={id:456,order:{id:789},integration_id:123,amount_cents:49900,currency:'EGP',pending:false,success:true,error_occured:false,is_auth:false,is_standalone_payment:true,is_refunded:false,is_voided:false};
  const body={obj},sig=signature(obj,'test-secret');assert.equal((await request('/webhooks/paymob?hmac=bad',{body})).status,403);
  assert.equal((await request('/webhooks/paymob?hmac='+sig,{body})).status,200);assert.equal((await request('/webhooks/paymob?hmac='+sig,{body})).status,200);
  assert.equal((await invoice.get()).data().status,'test_paid');assert.equal((await db.collection('brightAiPaymentEvents').get()).size,1);assert.equal((await tenant.get()).data().renewalDate,'2099-01-01');
 });
});

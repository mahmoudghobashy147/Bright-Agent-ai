'use strict';
/* Bright Ai V11: optional Firebase-backed backend. Never exposes Firebase Admin credentials to browsers. */
const http=require('node:http');
const paymob=require('./paymob');
const {validDate,subscriptionActive,requireSendingEnabled,reserveAi}=require('./security');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {verifyMetaSignature,parseIncomingWhatsApp,makeWhatsAppReply}=require('./whatsapp');
const {sendWhatsAppText,withinServiceWindow}=require('./whatsapp-send');
const {requestId,retryAdvice}=require('./outbound-guard');
const {createSavedReplyAgent,parseRules}=require('./saved-replies');
const {orderIntent}=require('./order-intent');
const {localWhatsApp}=require('./local-whatsapp');
const {startCheckout}=require('./subscription-engine');
const {normalizeAutomation,decideAutomation}=require('./automation-policy');
const {buildReviewTask,createReviewTask}=require('./inbox-workflow');
const {claim,belongsToClaim,stateForRecovery}=require('./task-recovery');
const PLANS=Object.freeze({starter:{priceEGP:499,limit:500},business:{priceEGP:999,limit:2000},pro:{priceEGP:1999,limit:5000}});
const isId=x=>typeof x==='string'&&/^[a-zA-Z0-9_-]{6,100}$/.test(x);
const txt=(x,n)=>String(x??'').trim().slice(0,n);
const monthlyKey=()=>new Date().toISOString().slice(0,7);
const today=()=>new Date().toISOString().slice(0,10);
const agentSettings=b=>({assistantProfile:['eldalel','smart_digital'].includes(b.assistantProfile)?b.assistantProfile:'generic',savedReplies:(parseRules(b.savedReplies||''),b.savedReplies||''),businessDescription:txt(b.businessDescription,1500),services:txt(b.services,2500),guidelines:txt(b.guidelines,2000),greeting:txt(b.greeting,500)});
const superAdmin=(u,allowedUids=new Set())=>u?.brightSuperAdmin===true||(typeof u?.uid==='string'&&allowedUids.has(u.uid));

const active=subscriptionActive;
const allowedOrigin=(origin,allowed)=>!origin||allowed.has(origin);
function rateLimiter(max=12,period=60000){const m=new Map();return k=>{const n=Date.now(),a=(m.get(k)||[]).filter(t=>n-t<period);if(a.length>=max)return false;a.push(n);m.set(k,a);if(m.size>5000)for(const [key,t] of m)if(t.at(-1)<n-period)m.delete(key);return true;};}
async function parseBody(req,maxBytes=10000){
 const chunks=[];let bytes=0;
 for await(const chunk of req){bytes+=chunk.length;if(bytes>maxBytes)throw Object.assign(Error('payload too large'),{status:413});chunks.push(chunk);}
 let value;try{value=JSON.parse(Buffer.concat(chunks).toString('utf8')||'{}');}catch{throw Object.assign(Error('invalid JSON'),{status:400});}
 if(!value||typeof value!=='object'||Array.isArray(value))throw Object.assign(Error('JSON object required'),{status:400});
 return value;
}
function send(res,status,data){res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff','x-frame-options':'DENY'});res.end(JSON.stringify(data));}
function makeService({admin,db,auth,allowedOrigins=new Set(),superAdminUids=new Set(),agent=async()=>({reply:'أهلًا بيك. تم استلام رسالتك التجريبية، وفريق العمل هيتابع معاك.',mode:'demo'})}){
 const throttle=rateLimiter();
 const isSuperAdmin=user=>superAdmin(user,superAdminUids);
 const tenants=db.collection('brightAiTenants');
 async function userFromBearer(req){const m=/^Bearer (\S+)$/.exec(req.headers.authorization||'');if(!m)throw Object.assign(Error('sign in required'),{status:401});let decoded;try{decoded=await auth.verifyIdToken(m[1],true);}catch{throw Object.assign(Error('invalid or expired session'),{status:401});}return decoded;}
 async function companyForUser(uid,tenantId){if(!isId(tenantId))throw Object.assign(Error('invalid tenant'),{status:400});const [member,tenant]=await Promise.all([tenants.doc(tenantId).collection('members').doc(uid).get(),tenants.doc(tenantId).get()]);if(!tenant.exists||!member.exists||member.data().active!==true)throw Object.assign(Error('access denied'),{status:403});return tenant.data();}
 return async function handler(req,res){try{
  const url=new URL(req.url,'http://localhost'),p=url.pathname;
  if(req.method==='GET'&&p==='/'){res.writeHead(302,{location:'/console/','cache-control':'no-store'});return res.end();}
  if(req.method==='GET'&&p==='/health')return send(res,200,{ok:true,version:26,storage:'firestore',mode:'cloud'});
  if(req.method==='GET'&&['/console/','/console/index.html','/console/app.js','/console/firebase-config.js','/console/eldalel-preset.js'].includes(p)){
    const name=p==='/console/'?'index.html':path.basename(p);
    const file=path.join(__dirname,'console',name);
    if(!fs.existsSync(file))return send(res,404,{error:'console config missing'});
    res.writeHead(200,{'content-type':name.endsWith('.js')?'text/javascript; charset=utf-8':'text/html; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff','content-security-policy':"default-src 'self'; script-src 'self' https://www.gstatic.com; connect-src 'self' https://*.googleapis.com https://identitytoolkit.googleapis.com https://securetoken.googleapis.com; style-src 'self' 'unsafe-inline'; img-src 'self' data:; frame-ancestors 'none'"});return res.end(fs.readFileSync(file));
  }
  if(!allowedOrigin(req.headers.origin,allowedOrigins))return send(res,403,{error:'origin not permitted'});
  if(req.headers.origin){res.setHeader('Access-Control-Allow-Origin',req.headers.origin);res.setHeader('Vary','Origin');}
  if(req.method==='OPTIONS'){res.writeHead(204,{'Access-Control-Allow-Origin':req.headers.origin||'','Access-Control-Allow-Headers':'Authorization, Content-Type','Access-Control-Allow-Methods':'GET, POST, OPTIONS'});return res.end();}
  if(req.method==='POST'&&['/api/company/local-whatsapp/bind','/api/company/local-whatsapp/inbox','/api/company/local-whatsapp/reply-claim','/api/company/local-whatsapp/reply-result'].includes(p)){
    const user=await userFromBearer(req),body=await parseBody(req),tenant=await companyForUser(user.uid,body.tenantId);
    return send(res,200,await localWhatsApp({action:p.split('/').at(-1),body,user,tenant,db,admin,plans:PLANS}));
  }
  if(req.method==='GET'&&p==='/api/me/companies'){
    const user=await userFromBearer(req);
    const snap=await tenants.where('memberUids','array-contains',user.uid).limit(100).get();
    const companies=[];
    for(const doc of snap.docs){const member=await doc.ref.collection('members').doc(user.uid).get();if(member.data()?.active===true)companies.push({id:doc.id,name:doc.data().name,role:member.data().role});}
    return send(res,200,{companies,superAdmin:isSuperAdmin(user)});
  }
  if(req.method==='GET'&&p==='/api/company/members'){
    const user=await userFromBearer(req),tenantId=url.searchParams.get('tenantId');
    await companyForUser(user.uid,tenantId);
    const member=await tenants.doc(tenantId).collection('members').doc(user.uid).get();
    if(!['owner','admin'].includes(member.data()?.role))return send(res,403,{error:'manager required'});
    const members=await tenants.doc(tenantId).collection('members').limit(100).get();
    return send(res,200,{members:members.docs.map(d=>({uid:d.id,role:d.data().role,active:d.data().active}))});
  }
  if(req.method==='POST'&&p==='/api/company/members'){
    const user=await userFromBearer(req),b=await parseBody(req),tenantId=txt(b.tenantId,100);
    await companyForUser(user.uid,tenantId);
    const uid=txt(b.uid,128),role=txt(b.role,20);
    if(!/^[-_a-zA-Z0-9]{6,128}$/.test(uid)||!['admin','staff'].includes(role)||typeof b.active!=='boolean')return send(res,400,{error:'invalid member data'});
    await auth.getUser(uid);
    const root=tenants.doc(tenantId);
    await db.runTransaction(async tx=>{
      const [actor,target,company]=await Promise.all([tx.get(root.collection('members').doc(user.uid)),tx.get(root.collection('members').doc(uid)),tx.get(root)]);
      if(actor.data()?.role!=='owner'||actor.data()?.active!==true||target.data()?.role==='owner')throw Object.assign(Error('only owner can manage non-owner members'),{status:403});
      const ids=new Set(company.data().memberUids||[]);if(b.active)ids.add(uid);else ids.delete(uid);
      tx.set(root.collection('members').doc(uid),{role,active:b.active},{merge:true});
      tx.update(root,{memberUids:[...ids]});
      tx.create(root.collection('audit').doc(),{action:'member.updated',actor:user.uid,target:uid,role,active:b.active,createdAt:admin.firestore.FieldValue.serverTimestamp()});
    });
    return send(res,200,{ok:true});
  }
  if(req.method==='POST'&&p==='/api/admin/whatsapp-channel'){
    const user=await userFromBearer(req);if(!isSuperAdmin(user))return send(res,403,{error:'super admin required'});
    const b=await parseBody(req),tenantId=txt(b.tenantId,100),phoneNumberId=txt(b.phoneNumberId,30);
    if(!isId(tenantId)||!/^\d{5,30}$/.test(phoneNumberId))return send(res,400,{error:'invalid channel'});
    const ref=db.collection('brightAiWhatsappChannels').doc(phoneNumberId);
    await db.runTransaction(async tx=>{
      const [tenant,mapping]=await Promise.all([tx.get(tenants.doc(tenantId)),tx.get(ref)]);
      if(!tenant.exists)throw Object.assign(Error('company not found'),{status:404});
      if(mapping.exists&&mapping.data().tenantId!==tenantId)throw Object.assign(Error('channel already belongs to another company'),{status:409});
      tx.set(ref,{tenantId,updatedBy:user.uid,updatedAt:admin.firestore.FieldValue.serverTimestamp()});
    });return send(res,200,{ok:true});
  }
  if(req.method==='POST'&&p==='/api/admin/companies'){
    const user=await userFromBearer(req);
    if(!isSuperAdmin(user))return send(res,403,{error:'super admin required'});
    const b=await parseBody(req),name=txt(b.name,120),ownerUid=txt(b.ownerUid,128),plan=txt(b.plan,30);
    if(name.length<2||!Object.hasOwn(PLANS,plan)||!/^[-_a-zA-Z0-9]{6,128}$/.test(ownerUid))return send(res,400,{error:'invalid company data'});
    // Auth must contain the intended owner. No users are created without trusted admin review.
    await auth.getUser(ownerUid);
    const ref=tenants.doc(),widgetId=crypto.randomBytes(18).toString('hex');
    await db.runTransaction(async tx=>{
      tx.create(ref,{name,plan,widgetId,memberUids:[ownerUid],subscriptionStatus:'suspended',renewalDate:null,agentSettings:agentSettings({}),automation:normalizeAutomation({}),createdAt:admin.firestore.FieldValue.serverTimestamp()});
      tx.create(ref.collection('members').doc(ownerUid),{active:true,role:'owner',createdAt:admin.firestore.FieldValue.serverTimestamp()});
    });
    return send(res,201,{tenantId:ref.id,widgetId,subscriptionStatus:'suspended'});
  }
  if(req.method==='GET'&&p==='/api/admin/companies'){
    const user=await userFromBearer(req);
    if(!isSuperAdmin(user))return send(res,403,{error:'super admin required'});
    const snap=await tenants.limit(100).get();
    return send(res,200,{companies:snap.docs.map(d=>({id:d.id,name:d.data().name,plan:d.data().plan,subscriptionStatus:d.data().subscriptionStatus}))});
  }
  if(req.method==='GET'&&p==='/api/company/agent-presets/smart-digital'){
    const user=await userFromBearer(req),tenantId=url.searchParams.get('tenantId');await companyForUser(user.uid,tenantId);
    const {intents}=require('./smart-digital-library');
    return send(res,200,{paths:intents.length,questionForms:intents.reduce((sum,i)=>sum+i.aliases.length,0),settings:{assistantProfile:'smart_digital',businessDescription:'Smart Digital — مواقع ومتاجر وتصميم ومحتوى وسوشيال وإعلانات.',services:'المواقع التعريفية والمتاجر، التصميم والهوية، المحتوى والريلز وإدارة الصفحات والإعلانات، مراجعة الدومين والاستضافة والدعم حسب الاتفاق.',greeting:'أهلًا بيك في Smart Digital 👋 نشاطك إيه ومحتاج نساعدك في إيه؟',guidelines:'لا تخترع أسعارًا أو مواعيد أو مزايا باقات أو ضمان مبيعات. اجمع المطلوب واطلب اعتماد الفريق.',savedReplies:intents.map(i=>i.aliases[0]+' | '+i.reply).join('\n')}});
  }
  if(req.method==='GET'&&p==='/api/company/agent'){
    const user=await userFromBearer(req),tenantId=url.searchParams.get('tenantId');
    const tenant=await companyForUser(user.uid,tenantId);
    return send(res,200,{settings:agentSettings(tenant.agentSettings||{})});
  }
  if(req.method==='POST'&&p==='/api/company/agent'){
    const user=await userFromBearer(req),b=await parseBody(req,800000),tenantId=txt(b.tenantId,100);
    await companyForUser(user.uid,tenantId);
    const member=await tenants.doc(tenantId).collection('members').doc(user.uid).get();
    if(!['owner','admin'].includes(member.data()?.role))return send(res,403,{error:'owner or admin required'});
    const settings=agentSettings(b);
    await tenants.doc(tenantId).update({agentSettings:settings,updatedAt:admin.firestore.FieldValue.serverTimestamp()});
    return send(res,200,{settings});
  }
  if(req.method==='POST'&&p==='/api/company/replies/preview'){
    const user=await userFromBearer(req),b=await parseBody(req);
    const tenant=await companyForUser(user.uid,txt(b.tenantId,100));
    const message=txt(b.text,1500);if(!message)return send(res,400,{error:'نص الاختبار مطلوب'});
    const result=await createSavedReplyAgent()({message,tenant,context:b.context&&typeof b.context==='object'?b.context:undefined});
    const media=result.mediaId?require('./eldalel-media')[result.mediaId]:null;
    return send(res,200,{...result,...(media?{media:{mimeType:media.mimeType,data:media.data,sourceUrl:media.sourceUrl}}:{}),sent:false,preview:true});
  }
  if(req.method==='GET'&&p==='/api/company'){
    const user=await userFromBearer(req),tenantId=url.searchParams.get('tenantId');
    const tenant=await companyForUser(user.uid,tenantId);
    return send(res,200,{tenant:{name:tenant.name,plan:tenant.plan,subscriptionStatus:tenant.subscriptionStatus,renewalDate:tenant.renewalDate||null}});
  }
  // Tenant-scoped operational overview. Uses bounded reads; no cross-tenant aggregation.
  if(req.method==='GET'&&p==='/api/company/overview'){
    const user=await userFromBearer(req),tenantId=url.searchParams.get('tenantId');
    const tenant=await companyForUser(user.uid,tenantId);
    const root=tenants.doc(tenantId);
    const [orders,inbox,conversations,usage]=await Promise.all([
      root.collection('orders').limit(100).get(),
      root.collection('whatsappInbox').limit(100).get(),
      root.collection('conversations').limit(100).get(),
      root.collection('usage').doc(monthlyKey()).get()
    ]);
    const orderRows=orders.docs.map(d=>d.data());
    const counts={};for(const o of orderRows){const k=String(o.status||'new');counts[k]=(counts[k]||0)+1;}
    return send(res,200,{company:tenant.name,plan:tenant.plan,subscriptionStatus:tenant.subscriptionStatus,
      month:monthlyKey(),monthlyRepliesUsed:Number(usage.data()?.reserved||0),
      monthlyReplyLimit:PLANS[tenant.plan]?.limit||0,
      sampled:{orders:orders.size,whatsappMessages:inbox.size,conversations:conversations.size,orderStatuses:counts},
      note:'Sampled counts are capped at 100 records per collection; not lifetime totals.'});
  }
  if(req.method==='GET'&&p==='/api/company/conversations'){
    const user=await userFromBearer(req),tenantId=url.searchParams.get('tenantId');
    await companyForUser(user.uid,tenantId);
    const tenantRef=tenants.doc(tenantId);
    const [snap,usageSnap]=await Promise.all([
      tenantRef.collection('conversations').orderBy('createdAt','desc').limit(50).get(),
      tenantRef.collection('usage').doc(monthlyKey()).get()
    ]);
    return send(res,200,{conversations:snap.docs.map(d=>({id:d.id,source:d.data().source||'website',message:txt(d.data().message,1500),reply:txt(d.data().reply,2000),createdAt:d.data().createdAt?.toDate?.()?.toISOString()||null})),usage:{month:monthlyKey(),reserved:usageSnap.exists?(usageSnap.data().reserved||0):0}});
  }
  // Payment preview ONLY. Do not accept payment status or account activation from browser.
  if(req.method==='GET'&&p==='/api/company/invoices'){
    const user=await userFromBearer(req),tenantId=url.searchParams.get('tenantId');await companyForUser(user.uid,tenantId);
    const member=await tenants.doc(tenantId).collection('members').doc(user.uid).get();
    if(member.data()?.role!=='owner')return send(res,403,{error:'owner required'});
    const snap=await db.collection('brightAiInvoices').where('tenantId','==',tenantId).limit(50).get();
    return send(res,200,{invoices:snap.docs.map(d=>({id:d.id,plan:d.data().plan,amountMinor:d.data().amountMinor,currency:'EGP',status:d.data().status,mode:'sandbox'}))});
  }
  if(req.method==='POST'&&p==='/api/company/checkout'){
    const user=await userFromBearer(req),b=await parseBody(req),tenantId=txt(b.tenantId,100),tenant=await companyForUser(user.uid,tenantId);
    const member=await tenants.doc(tenantId).collection('members').doc(user.uid).get();
    if(member.data()?.role!=='owner')return send(res,403,{error:'owner required'});
    paymob.sandboxConfig();
    if(!/^[a-zA-Z0-9_-]{16,80}$/.test(b.requestId||''))return send(res,400,{error:'unique requestId required'});
    const id=crypto.createHash('sha256').update(tenantId+':'+b.requestId).digest('hex'),ref=db.collection('brightAiInvoices').doc(id);
    const data={tenantId,plan:tenant.plan,amountMinor:PLANS[tenant.plan].priceEGP*100,status:'creating',mode:'sandbox',createdBy:user.uid,createdAt:admin.firestore.FieldValue.serverTimestamp()};
    try{await ref.create(data);}catch(e){if(e.code===6||e.code==='already-exists')return send(res,409,{error:'checkout already recorded; inspect invoice before retry',invoiceId:id});throw e;}
    try{
      const result=await paymob.createIntention({invoiceId:id,plan:PLANS[tenant.plan],billing:b.billing});
      await ref.update({providerOrderId:result.orderId,status:'pending'});
      return send(res,201,{invoiceId:id,checkoutUrl:result.url,mode:'sandbox',activatesSubscription:false});
    }catch(e){await ref.update({status:'needs_reconciliation'});throw e;}
  }
  if(req.method==='POST'&&p==='/webhooks/paymob'){
    const c=paymob.sandboxConfig(),body=await parseBody(req,100000);
    if(!paymob.verified(body,url.searchParams.get('hmac'),process.env.PAYMOB_HMAC_SECRET))return send(res,403,{error:'invalid payment signature'});
    const obj=body.obj;
    if(!Number.isSafeInteger(obj.id)||!Number.isSafeInteger(obj.order?.id))return send(res,400,{error:'invalid payment identifiers'});
    const invoices=await db.collection('brightAiInvoices').where('providerOrderId','==',String(obj.order.id)).limit(2).get();
    if(invoices.size!==1)return send(res,409,{error:'payment not reconciled to exactly one invoice'});
    const invoice=invoices.docs[0],eventRef=db.collection('brightAiPaymentEvents').doc(String(obj.id)+'_'+String(obj.pending)+'_'+String(obj.is_refunded)+'_'+String(obj.is_voided));
    await db.runTransaction(async tx=>{
      const [current,event]=await Promise.all([tx.get(invoice.ref),tx.get(eventRef)]);
      if(event.exists)return;
      const status=paymob.classify(obj,current.data(),c.integration);
      tx.create(eventRef,{invoiceId:invoice.id,status,mode:'sandbox',createdAt:admin.firestore.FieldValue.serverTimestamp()});
      if(current.data().status!=='reversed'&&(current.data().status!=='test_paid'||status==='reversed'))tx.update(invoice.ref,{status,transactionId:String(obj.id)});
    });
    // Sandbox callbacks NEVER activate real company subscriptions.
    return send(res,200,{received:true,mode:'sandbox'});
  }
  if(req.method==='GET'&&p==='/api/company/billing-preview'){
    const user=await userFromBearer(req),tenantId=url.searchParams.get('tenantId');
    const tenant=await companyForUser(user.uid,tenantId);
    return send(res,200,{checkout:startCheckout({tenantId,plan:tenant.plan}),subscriptionStatus:tenant.subscriptionStatus,renewalDate:tenant.renewalDate||null});
  }
  // V19 automation policy is a preview only. Never sends a WhatsApp message.
  if(req.method==='GET'&&p==='/api/company/automation'){
    const user=await userFromBearer(req),tenantId=url.searchParams.get('tenantId');
    const tenant=await companyForUser(user.uid,tenantId);
    return send(res,200,{settings:normalizeAutomation(tenant.automation||{}),liveSendingEnabled:false});
  }
  if(req.method==='POST'&&p==='/api/company/automation'){
    const user=await userFromBearer(req),b=await parseBody(req),tenantId=txt(b.tenantId,100);
    await companyForUser(user.uid,tenantId);
    const member=await tenants.doc(tenantId).collection('members').doc(user.uid).get();
    if(!['owner','admin'].includes(member.data()?.role))return send(res,403,{error:'owner or admin required'});
    const settings=normalizeAutomation(b);
    await tenants.doc(tenantId).update({automation:settings,updatedAt:admin.firestore.FieldValue.serverTimestamp()});
    return send(res,200,{settings,liveSendingEnabled:false});
  }
  if(req.method==='POST'&&p==='/api/company/automation/preview'){
    const user=await userFromBearer(req),b=await parseBody(req),tenantId=txt(b.tenantId,100);
    const tenant=await companyForUser(user.uid,tenantId);
    const settings=normalizeAutomation(tenant.automation||{});
    const decision=decideAutomation({settings,subscriptionActive:active(tenant),withinWindow:b.withinWindow===true,remainingReplies:Number.isSafeInteger(b.remainingReplies)?b.remainingReplies:0,customerOptOut:b.customerOptOut===true});
    return send(res,200,{decision,sent:false});
  }
  // Subscription changes require a trusted super-admin. No automatic payment activation.
  if(req.method==='POST'&&p==='/api/admin/subscription'){
    const user=await userFromBearer(req);
    if(!isSuperAdmin(user))return send(res,403,{error:'super admin required'});
    const b=await parseBody(req),tenantId=txt(b.tenantId,100),plan=txt(b.plan,30),status=txt(b.status,30),renewalDate=txt(b.renewalDate,10);
    if(!isId(tenantId)||!Object.hasOwn(PLANS,plan)||!['active','suspended','trial'].includes(status)||!validDate(renewalDate))return send(res,400,{error:'invalid subscription'});
    const ref=tenants.doc(tenantId);if(!(await ref.get()).exists)return send(res,404,{error:'company not found'});
    await ref.update({plan,subscriptionStatus:status,renewalDate,updatedAt:admin.firestore.FieldValue.serverTimestamp()});
    return send(res,200,{ok:true,plan,status,renewalDate});
  }
  // Staff can create an order only for a company they belong to.
  if(req.method==='POST'&&p==='/api/company/orders'){
    const user=await userFromBearer(req),b=await parseBody(req),tenantId=txt(b.tenantId,100);
    await companyForUser(user.uid,tenantId);
    const customerName=txt(b.customerName,120),contact=txt(b.contact,120),details=txt(b.details,2000);
    if(customerName.length<2||details.length<3||!contact)return send(res,400,{error:'customer name, contact and details required'});
    const ref=tenants.doc(tenantId).collection('orders').doc();
    await ref.create({customerName,contact,details,status:'new',source:'staff',createdBy:user.uid,createdAt:admin.firestore.FieldValue.serverTimestamp()});
    return send(res,201,{orderId:ref.id,status:'new'});
  }
  // V22: authenticated review-task inbox. No automatic sends or unattended AI requests.
  if(req.method==='GET'&&p==='/api/company/review-tasks'){
    const user=await userFromBearer(req),tenantId=url.searchParams.get('tenantId');
    await companyForUser(user.uid,tenantId);
    const snap=await tenants.doc(tenantId).collection('automationTasks').orderBy('createdAtMillis','desc').limit(50).get();
    return send(res,200,{tasks:snap.docs.map(d=>({id:d.id,inboundId:d.data().inboundId,status:d.data().status,draftId:d.data().draftId||null}))});
  }
  if(req.method==='POST'&&p==='/api/company/review-tasks/generate'){
    const user=await userFromBearer(req),b=await parseBody(req),tenantId=txt(b.tenantId,100),taskId=txt(b.taskId,110);
    const tenant=await companyForUser(user.uid,tenantId);
    if(!/^review_[a-f0-9]{64}$/.test(taskId))return send(res,400,{error:'invalid task ID'});
    if(!active(tenant))return send(res,403,{error:'subscription inactive'});
    const base=tenants.doc(tenantId),ref=base.collection('automationTasks').doc(taskId);
    const initial=await ref.get();if(!initial.exists)return send(res,404,{error:'task not found'});
    const original=initial.data();
    if(original.status==='awaiting_review')return send(res,200,{draftId:original.draftId,status:'awaiting_review',sent:false});
    if(!stateForRecovery(original).recoverable)return send(res,409,{error:'task busy, closed, or retry limit reached'});
    const inbox=await base.collection('whatsappInbox').doc(original.inboundId).get();
    if(!inbox.exists)return send(res,404,{error:'source message unavailable'});
    if(!withinServiceWindow(inbox.data().receivedAtMillis))return send(res,403,{error:'service window expired'});
    const claimed=await db.runTransaction(async tx=>{
      const snap=await tx.get(ref);
      if(!snap.exists)return null;
      const lease=claim(snap.data(),user.uid);
      if(!lease)return null;
      tx.update(ref,lease);return lease;
    });
    if(!claimed)return send(res,409,{error:'task already claimed or retry limit reached'});
    let reply,draftMode;
    try{
      await reserveAi({db,tenantRef:base,plans:PLANS});
      const draft=await agent({message:txt(inbox.data().text,1500),tenant});
      if(!draft||!['openai','saved_reply','saved_review'].includes(draft.mode)||!txt(draft.reply,2000))throw Error('live AI unavailable');
      reply=txt(draft.reply,2000);draftMode=draft.mode;
    }catch(e){
      await db.runTransaction(async tx=>{
        const current=await tx.get(ref);
        if(current.exists&&belongsToClaim(current.data(),claimed.claimToken))
          tx.update(ref,{status:'failed',error:'AI unavailable'});
      });
      return send(res,e.status||503,{error:e.status?e.message:'AI unavailable; task not sent'});
    }
    const draftRef=base.collection('whatsappDrafts').doc('task_'+taskId);
    await db.runTransaction(async tx=>{
      const [task,draft]=await Promise.all([tx.get(ref),tx.get(draftRef)]);
      if(!belongsToClaim(task.data(),claimed.claimToken))throw Object.assign(Error('task state changed'),{status:409});
      if(!draft.exists)tx.create(draftRef,{sourceMessageId:original.inboundId,reply,createdBy:user.uid,mode:draftMode,status:'awaiting_review',createdAt:admin.firestore.FieldValue.serverTimestamp()});
      tx.update(ref,{status:'awaiting_review',draftId:draftRef.id,sent:false});
    });
    return send(res,201,{draftId:draftRef.id,reply,status:'awaiting_review',sent:false});
  }
  // V14: Suggested AI drafts, NEVER sent to Meta automatically.
  // A staff member must explicitly review and use the existing manual reply endpoint.
  if(req.method==='POST'&&p==='/api/company/whatsapp/draft'){
    const user=await userFromBearer(req),b=await parseBody(req),tenantId=txt(b.tenantId,100),messageId=txt(b.messageId,100);
    const tenant=await companyForUser(user.uid,tenantId);
    if(!isId(messageId))return send(res,400,{error:'invalid message ID'});
    const recordSnap=await tenants.doc(tenantId).collection('whatsappInbox').doc(messageId).get();
    if(!recordSnap.exists)return send(res,404,{error:'message not found'});
    if(!active(tenant))return send(res,403,{error:'subscription inactive'});
    const record=recordSnap.data();
    if(record.source==='local_qr')return send(res,409,{error:'ردود QR للمراجعة فقط؛ إرسال Meta لا ينطبق عليها'});
    if(!withinServiceWindow(record.receivedAtMillis))return send(res,403,{error:'service window expired'});
    // Use the same tenant-scoped assistant settings as website replies.
    // A preview does not make an external API send request to WhatsApp.
    let draft;
    try{await reserveAi({db,tenantRef:tenants.doc(tenantId),plans:PLANS});draft=await agent({message:txt(record.text,1500),tenant});}
    catch(e){return send(res,e.status||503,{error:e.status?e.message:'AI draft unavailable'});}
    if(!draft||!['openai','saved_reply','saved_review'].includes(draft.mode))return send(res,503,{error:'live AI not configured; draft not generated'});
    const reply=txt(draft.reply,2000);
    if(!reply)return send(res,503,{error:'empty AI draft'});
    const draftRef=tenants.doc(tenantId).collection('whatsappDrafts').doc();
    await draftRef.create({sourceMessageId:messageId,reply,createdBy:user.uid,mode:txt(draft.mode,30),status:'awaiting_review',createdAt:admin.firestore.FieldValue.serverTimestamp()});
    return send(res,201,{draftId:draftRef.id,reply,status:'awaiting_review',sent:false});
  }
  if(req.method==='GET'&&p==='/api/company/whatsapp/drafts'){
    const user=await userFromBearer(req),tenantId=url.searchParams.get('tenantId');
    await companyForUser(user.uid,tenantId);
    const snap=await tenants.doc(tenantId).collection('whatsappDrafts').orderBy('createdAt','desc').limit(50).get();
    return send(res,200,{drafts:snap.docs.map(d=>({id:d.id,sourceMessageId:d.data().sourceMessageId,reply:txt(d.data().outboundReply||d.data().reply,2000),source:d.data().source||'meta',status:d.data().status,createdAt:d.data().createdAt?.toDate?.()?.toISOString()||null}))});
  }
  if(req.method==='GET'&&p==='/api/company/whatsapp-inbox'){
    const user=await userFromBearer(req),tenantId=url.searchParams.get('tenantId');
    await companyForUser(user.uid,tenantId);
    const snap=await tenants.doc(tenantId).collection('whatsappInbox').orderBy('createdAt','desc').limit(50).get();
    return send(res,200,{messages:snap.docs.map(d=>({id:d.id,from:txt(d.data().from,40),source:d.data().source||'meta',text:txt(d.data().text,1500),status:d.data().status||'new',createdAt:d.data().createdAt?.toDate?.()?.toISOString()||null}))});
  }
  // Explicitly approved MANUAL WhatsApp reply. No AI autoposting and no templates.
  if(req.method==='POST'&&p==='/api/company/whatsapp/reply'){
    requireSendingEnabled();
    const user=await userFromBearer(req),b=await parseBody(req),tenantId=txt(b.tenantId,100),messageId=txt(b.messageId,100),reply=txt(b.reply,2000);
    await companyForUser(user.uid,tenantId);
    if(!isId(messageId)||reply.length<1)return send(res,400,{error:'message ID and reply required'});
    const ref=tenants.doc(tenantId).collection('whatsappInbox').doc(messageId),snap=await ref.get();
    if(!snap.exists)return send(res,404,{error:'message not found'});
    const record=snap.data();
    if(record.source==='local_qr')return send(res,409,{error:'إرسال QR غير مفعل؛ هذه مسودة للمراجعة فقط'});
    if(!withinServiceWindow(record.receivedAtMillis))return send(res,403,{error:'customer service window expired; use approved templates via a separate integration'});
    if(!active((await tenants.doc(tenantId).get()).data()))return send(res,403,{error:'subscription inactive'});
    if(!process.env.WA_ACCESS_TOKEN||!process.env.WA_GRAPH_VERSION)return send(res,503,{error:'WhatsApp outbound not configured'});
    // Trust number ID only from the verified inbound record and require a matching channel mapping.
    const mapping=await db.collection('brightAiWhatsappChannels').doc(record.phoneNumberId).get();
    if(!mapping.exists||mapping.data().tenantId!==tenantId)return send(res,403,{error:'channel not authorized for this company'});
    // A stable request ID protects against browser retries and double-clicks.
    // A network timeout is ambiguous: Meta might have accepted the message.
    // Keep such events 'unknown', never blindly resend them.
    const outboundRef=tenants.doc(tenantId).collection('whatsappOutbox').doc(requestId(messageId,reply));
    try{
      await outboundRef.create({fromMessageId:messageId,to:record.from,reply,createdBy:user.uid,status:'pending',createdAt:admin.firestore.FieldValue.serverTimestamp()});
    }catch(e){
      if(e.code!==6&&e.code!=='already-exists')throw e;
      const prior=await outboundRef.get();
      return send(res,409,{error:'reply request already recorded; check outbox before retry',outboundId:outboundRef.id,status:prior.data()?.status||'unknown',advice:retryAdvice(prior.data()?.status)});
    }
    try{
      const result=await sendWhatsAppText({phoneNumberId:record.phoneNumberId,to:record.from,text:reply,token:process.env.WA_ACCESS_TOKEN,version:process.env.WA_GRAPH_VERSION});
      await outboundRef.update({status:'sent',metaMessageId:result.messageId,updatedAt:admin.firestore.FieldValue.serverTimestamp()});
      return send(res,200,{ok:true,outboundId:outboundRef.id});
    }catch(e){
      await outboundRef.update({status:'unknown',error:txt(e.message,250),updatedAt:admin.firestore.FieldValue.serverTimestamp()});
      return send(res,502,{error:'WhatsApp outcome unconfirmed; inspect outbox and Meta message status before attempting another reply',outboundId:outboundRef.id});
    }
  }
  // Review candidate leads, created automatically from verified messages with order intent.
  if(req.method==='GET'&&p==='/api/company/order-leads'){
    const user=await userFromBearer(req),tenantId=url.searchParams.get('tenantId');
    await companyForUser(user.uid,tenantId);
    const snap=await tenants.doc(tenantId).collection('orderLeads').orderBy('createdAt','desc').limit(50).get();
    return send(res,200,{leads:snap.docs.map(d=>({id:d.id,customerName:txt(d.data().customerName,120),contact:txt(d.data().contact,120),details:txt(d.data().details,1500),status:d.data().status,sourceMessageId:d.data().sourceMessageId}))});
  }
  // Staff approves a lead; transactional read-before-write avoids duplicate orders.
  if(req.method==='POST'&&p==='/api/company/approve-order-lead'){
    const user=await userFromBearer(req),b=await parseBody(req),tenantId=txt(b.tenantId,100),leadId=txt(b.leadId,100);
    await companyForUser(user.uid,tenantId);
    if(!isId(leadId))return send(res,400,{error:'invalid lead'});
    const root=tenants.doc(tenantId),leadRef=root.collection('orderLeads').doc(leadId),orderRef=root.collection('orders').doc('lead_'+leadId);
    let found=false,created=false;
    await db.runTransaction(async tx=>{
      const lead=await tx.get(leadRef),existing=await tx.get(orderRef);
      if(!lead.exists)return;
      found=true;
      if(existing.exists)return;
      const data=lead.data();
      if(data.status!=='pending_review')return;
      const details=txt(b.details||data.details,2000),customerName=txt(b.customerName||data.customerName,120);
      if(details.length<3||customerName.length<2)throw Object.assign(Error('incomplete order'),{status:400});
      tx.create(orderRef,{customerName,contact:txt(data.contact,120),details,source:'whatsapp',sourceLeadId:leadId,status:'new',assignedTo:null,createdBy:user.uid,createdAt:admin.firestore.FieldValue.serverTimestamp()});
      tx.update(leadRef,{status:'approved',approvedBy:user.uid,orderId:orderRef.id,updatedAt:admin.firestore.FieldValue.serverTimestamp()});created=true;
    });
    if(!found)return send(res,404,{error:'lead not found'});
    return send(res,created?201:200,{orderId:orderRef.id,created});
  }
  // One-click conversion of a verified inbound WhatsApp message into an order.
  // The operation is idempotent and confined to the authenticated employee's tenant.
  if(req.method==='POST'&&p==='/api/company/order-from-whatsapp'){
    const user=await userFromBearer(req),b=await parseBody(req);
    const tenantId=txt(b.tenantId,100),messageId=txt(b.messageId,100);
    await companyForUser(user.uid,tenantId);
    if(!isId(messageId))return send(res,400,{error:'invalid message ID'});
    const tenantRef=tenants.doc(tenantId),inboxRef=tenantRef.collection('whatsappInbox').doc(messageId);
    const inbox=await inboxRef.get();
    if(!inbox.exists)return send(res,404,{error:'inbox message not found'});
    const data=inbox.data();
    const details=txt(b.details||data.text,2000),customerName=txt(b.customerName||'عميل واتساب',120);
    if(details.length<3||customerName.length<2)return send(res,400,{error:'missing order details'});
    const orderRef=tenantRef.collection('orders').doc('wa_'+messageId);
    let created=false;
    await db.runTransaction(async tx=>{
      const existing=await tx.get(orderRef);
      if(!existing.exists){
        tx.create(orderRef,{customerName,contact:txt(data.from,120),details,source:'whatsapp',sourceMessageId:messageId,
          status:'new',assignedTo:null,createdBy:user.uid,createdAt:admin.firestore.FieldValue.serverTimestamp()});
        created=true;
      }
      tx.update(inboxRef,{status:'converted',orderId:orderRef.id,updatedAt:admin.firestore.FieldValue.serverTimestamp()});
    });
    return send(res,created?201:200,{orderId:orderRef.id,created});
  }
  // Assign an order to a verified active member of the same company.
  if(req.method==='POST'&&p==='/api/company/assign-order'){
    const user=await userFromBearer(req),b=await parseBody(req),tenantId=txt(b.tenantId,100);
    await companyForUser(user.uid,tenantId);
    const member=await tenants.doc(tenantId).collection('members').doc(user.uid).get();
    if(!['owner','admin'].includes(member.data()?.role))return send(res,403,{error:'manager required'});
    const orderId=txt(b.orderId,100),assignee=txt(b.assigneeUid,128);
    if(!isId(orderId)||!/^[-_a-zA-Z0-9]{6,128}$/.test(assignee))return send(res,400,{error:'invalid assignment'});
    const [order,staff]=await Promise.all([tenants.doc(tenantId).collection('orders').doc(orderId).get(),tenants.doc(tenantId).collection('members').doc(assignee).get()]);
    if(!order.exists)return send(res,404,{error:'order not found'});
    if(!staff.exists||staff.data()?.active!==true)return send(res,403,{error:'assignee not an active company member'});
    await order.ref.update({assignedTo:assignee,status:'in_progress',updatedAt:admin.firestore.FieldValue.serverTimestamp()});
    return send(res,200,{ok:true,orderId,assignedTo:assignee});
  }
  if(req.method==='GET'&&p==='/api/company/orders'){
    const user=await userFromBearer(req),tenantId=url.searchParams.get('tenantId');
    await companyForUser(user.uid,tenantId);
    const snap=await tenants.doc(tenantId).collection('orders').orderBy('createdAt','desc').limit(50).get();
    return send(res,200,{orders:snap.docs.map(d=>({id:d.id,...d.data(),createdAt:d.data().createdAt?.toDate?.()?.toISOString()||null}))});
  }
  if(req.method==='POST'&&p==='/api/company/order-status'){
    const user=await userFromBearer(req),b=await parseBody(req),tenantId=txt(b.tenantId,100),orderId=txt(b.orderId,100),status=txt(b.status,30);
    await companyForUser(user.uid,tenantId);
    if(!isId(orderId)||!['new','in_progress','completed','cancelled'].includes(status))return send(res,400,{error:'invalid order update'});
    const ref=tenants.doc(tenantId).collection('orders').doc(orderId);
    if(!(await ref.get()).exists)return send(res,404,{error:'order not found'});
    await ref.update({status,updatedAt:admin.firestore.FieldValue.serverTimestamp()});return send(res,200,{ok:true});
  }
  // WhatsApp verification and inbound webhook: require Meta app secret for POST.
  if(p==='/webhooks/whatsapp'&&req.method==='GET'){
    if(!process.env.WA_VERIFY_TOKEN)return send(res,503,{error:'WhatsApp not configured'});
    if(url.searchParams.get('hub.mode')!=='subscribe'||url.searchParams.get('hub.verify_token')!==process.env.WA_VERIFY_TOKEN)return send(res,403,{error:'invalid verification'});
    res.writeHead(200,{'content-type':'text/plain; charset=utf-8'});return res.end(url.searchParams.get('hub.challenge')||'');
  }
  if(p==='/webhooks/whatsapp'&&req.method==='POST'){
    if(!process.env.WA_APP_SECRET)return send(res,503,{error:'WhatsApp not configured'});
    const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>100000)return send(res,413,{error:'too large'});chunks.push(chunk);}
    const raw=Buffer.concat(chunks);
    if(!verifyMetaSignature(raw,req.headers['x-hub-signature-256'],process.env.WA_APP_SECRET))return send(res,403,{error:'invalid signature'});
    let data;try{data=JSON.parse(raw.toString('utf8'));}catch{return send(res,400,{error:'invalid JSON'});}
    const inbound=parseIncomingWhatsApp(data);
    let saved=0,unknown=0;
    for(const item of inbound){
      // phone_number_id is assigned by Meta to a business number. Only an admin
      // can map this number to a tenant; the sender cannot choose its tenant.
      if(!/^\d{5,30}$/.test(item.phoneNumberId)){unknown++;continue;}
      const mapping=await db.collection('brightAiWhatsappChannels').doc(item.phoneNumberId).get();
      const tenantId=mapping.data()?.tenantId;
      if(!mapping.exists||!isId(tenantId)){unknown++;continue;}
      const tenantSnap=await tenants.doc(tenantId).get();
      if(!tenantSnap.exists){unknown++;continue;}
      const docId=crypto.createHash('sha256').update(item.phoneNumberId+':'+item.id).digest('hex');
      const msgRef=tenants.doc(tenantId).collection('whatsappInbox').doc(docId);
      const root=tenants.doc(tenantId),task=buildReviewTask({inboundId:docId,tenant:tenantSnap.data()}),candidate=orderIntent(item.text);
      await db.runTransaction(async tx=>{
        const existing=await tx.get(msgRef);
        if(existing.exists)return;
        // Use Meta's signed customer timestamp, never webhook arrival time.
        // Late delivery must not reopen the customer service window.
        tx.create(msgRef,{metaId:item.id,from:item.from,text:item.text,phoneNumberId:item.phoneNumberId,status:'new',receivedAtMillis:item.sentAtMillis,createdAt:admin.firestore.FieldValue.serverTimestamp()});
        if(task)tx.create(root.collection('automationTasks').doc(task.id),task.record);
        if(candidate)tx.create(root.collection('orderLeads').doc('wa_'+docId),{...candidate,contact:txt(item.from,120),sourceMessageId:docId,createdAt:admin.firestore.FieldValue.serverTimestamp()});
      });
      saved++;

    }
    // No automatic messages: sending requires opt-in, template/window checks,
    // channel access tokens, and an outbound audit log.
    console.log('Verified WhatsApp inbound', {count:inbound.length,saved,unmapped:unknown});
    return send(res,200,{received:true});
  }
  if(req.method==='GET'&&p==='/api/public/config'){
    const widgetId=txt(url.searchParams.get('widgetId'),100);
    if(!isId(widgetId))return send(res,400,{error:'invalid widget'});
    const result=await tenants.where('widgetId','==',widgetId).limit(1).get();
    if(result.empty)return send(res,404,{error:'widget not found'});
    const tenant=result.docs[0].data();return send(res,200,{name:tenant.name,enabled:active(tenant)&&process.env.BRIGHT_PUBLIC_CHAT_ENABLED!=='false'});
  }
  if(req.method==='GET'&&p==='/widget.js'){
    res.writeHead(200,{'content-type':'text/javascript; charset=utf-8','cache-control':'public, max-age=300','x-content-type-options':'nosniff'});
    return res.end(fs.readFileSync(path.join(__dirname,'widget.js')));
  }
  if(req.method==='POST'&&p==='/api/public/message'){
    if(process.env.BRIGHT_PUBLIC_CHAT_ENABLED==='false')return send(res,503,{error:'public chat disabled until integration acceptance'});
    const b=await parseBody(req),widgetId=txt(b.widgetId,100),message=txt(b.text,1500);
    if(!isId(widgetId)||!message)return send(res,400,{error:'widgetId and text required'});
    if(!throttle(`${req.socket.remoteAddress}:${widgetId}`))return send(res,429,{error:'slow down'});
    const matches=await tenants.where('widgetId','==',widgetId).limit(1).get();
    if(matches.empty)return send(res,404,{error:'widget not found'});
    const tenantDoc=matches.docs[0],tenant=tenantDoc.data(),plan=PLANS[tenant.plan];
    if(!plan||!active(tenant))return send(res,403,{error:'subscription inactive'});
    await reserveAi({db,tenantRef:tenantDoc.ref,plans:PLANS});
    const conversationRef=tenantDoc.ref.collection('conversations').doc();
    // Fresh conversation per request: avoids accepting spoofed conversation IDs or exposing existing visitor messages.
    let answer;
    try{answer=await agent({message,tenant});}catch(e){console.error('Agent failure',e.message);answer={reply:'عذرًا، الخدمة مش متاحة حاليًا. هنطلب من الفريق يتابع معاك.',mode:'fallback'};}
    await conversationRef.set({source:'website',createdAt:admin.firestore.FieldValue.serverTimestamp(),message,reply:txt(answer.reply,2000),mode:txt(answer.mode,20),requiresReview:answer.requiresReview===true});
    return send(res,['openai','saved_reply','saved_review'].includes(answer.mode)?200:503,{reply:txt(answer.reply,2000),mode:answer.mode,requiresReview:answer.requiresReview===true,requestId:conversationRef.id});
  }
  return send(res,404,{error:'not found'});
 }catch(e){console.error('Cloud request failure',e.message);return send(res,e.status||500,{error:e.status?e.message:'internal error'});}}
}
function start(){if(!process.env.GOOGLE_CLOUD_PROJECT||!process.env.BRIGHT_FIREBASE_PROJECT_ID||process.env.GOOGLE_CLOUD_PROJECT!==process.env.BRIGHT_FIREBASE_PROJECT_ID)throw Error('Matching GOOGLE_CLOUD_PROJECT and BRIGHT_FIREBASE_PROJECT_ID required');
 const origins=new Set((process.env.BRIGHT_ALLOWED_ORIGINS||'').split(',').map(x=>x.trim()).filter(Boolean));if(!origins.size)throw Error('BRIGHT_ALLOWED_ORIGINS required for cloud use');
 const {initializeApp,applicationDefault}=require('firebase-admin/app');
 const {getFirestore,FieldValue}=require('firebase-admin/firestore');
 const {getAuth}=require('firebase-admin/auth');
 const app=initializeApp({credential:applicationDefault(),projectId:process.env.BRIGHT_FIREBASE_PROJECT_ID});
 const admin={firestore:{FieldValue}};
 const agent=createSavedReplyAgent();
 const superAdminUids=new Set((process.env.BRIGHT_SUPER_ADMIN_UIDS||'').split(',').map(x=>x.trim()).filter(Boolean));
 const handler=makeService({admin,db:getFirestore(app),auth:getAuth(app),allowedOrigins:origins,superAdminUids,agent});
 const port=Number(process.env.PORT||8080),server=http.createServer(handler);
 server.requestTimeout=30000;server.headersTimeout=10000;
 server.listen(port,()=>console.log('Bright Ai V26 cloud service listening '+server.address().port));
 return server;
}
if(require.main===module)start();
module.exports={PLANS,isId,active,allowedOrigin,rateLimiter,agentSettings,superAdmin,makeService};

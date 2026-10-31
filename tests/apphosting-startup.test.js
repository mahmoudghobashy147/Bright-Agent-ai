'use strict';
// Real Node server + Firebase Auth/Firestore emulators; no production accounts.
const {test}=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {spawn}=require('node:child_process');
const enabled=process.env.FIRESTORE_EMULATOR_HOST==='127.0.0.1:8085'&&process.env.FIREBASE_AUTH_EMULATOR_HOST==='127.0.0.1:9099';
test('deployed server contract: real Auth tokens, tenant lifecycle, orders and disabled sessions',{skip:!enabled,timeout:45000},async t=>{
 const sdk=require('node:module').createRequire(path.resolve(__dirname,'../cloud/package.json'));
 const {initializeApp,deleteApp}=sdk('firebase-admin/app'),{getAuth}=sdk('firebase-admin/auth');
 const app=initializeApp({projectId:'demo-bright-ai'},'startup-test');t.after(()=>deleteApp(app));const auth=getAuth(app);
 await auth.createUser({uid:'bootstrap-admin',email:'admin@bright-test.invalid',password:'EmulatorOnly-Test-123!'});
 await auth.createUser({uid:'company-owner',email:'owner@bright-test.invalid',password:'EmulatorOnly-Test-123!'});
 async function token(email){const r=await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=emulator-only',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password:'EmulatorOnly-Test-123!',returnSecureToken:true})});assert.equal(r.status,200);return (await r.json()).idToken;}
 const adminToken=await token('admin@bright-test.invalid'),ownerToken=await token('owner@bright-test.invalid');
 const env={...process.env,GOOGLE_CLOUD_PROJECT:'demo-bright-ai',BRIGHT_FIREBASE_PROJECT_ID:'demo-bright-ai',BRIGHT_SUPER_ADMIN_UIDS:'bootstrap-admin',BRIGHT_ALLOWED_ORIGINS:'https://console.test',BRIGHT_PUBLIC_CHAT_ENABLED:'false',BRIGHT_ALLOW_CUSTOMER_SENDS:'false',BRIGHT_PAYMENTS_MODE:'disabled',OPENAI_API_KEY:'',WA_ACCESS_TOKEN:'',PORT:'0'};
 const child=spawn(process.execPath,['service.js'],{cwd:path.resolve(__dirname,'../cloud'),env,stdio:['ignore','pipe','pipe']});let stderr='';child.stderr.on('data',d=>stderr+=d.toString());t.after(()=>{child.kill();});
 const port=await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(Error('startup timeout: '+stderr)),15000);let out='';child.stdout.on('data',d=>{out+=d;const m=/cloud service listening (\d+)/.exec(out);if(m){clearTimeout(timeout);resolve(Number(m[1]));}});child.on('exit',code=>{clearTimeout(timeout);reject(Error('server exited '+code+': '+stderr));});});
 const base='http://127.0.0.1:'+port;
 async function api(url,session,body){const r=await fetch(base+url,{method:body?'POST':'GET',headers:{...(session?{Authorization:'Bearer '+session}:{}),...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,data:await r.json()};}
 assert.equal((await api('/health')).status,200);
 assert.equal((await fetch(base+'/console/')).status,200);
 assert.equal((await api('/api/admin/companies',ownerToken)).status,403);
 const created=await api('/api/admin/companies',adminToken,{name:'شركة اختبار العزل',ownerUid:'company-owner',plan:'starter'});assert.equal(created.status,201);const tenantId=created.data.tenantId;
 assert.equal((await api('/api/me/companies',ownerToken)).data.companies[0].id,tenantId);
 assert.equal((await api('/api/admin/subscription',adminToken,{tenantId,plan:'starter',status:'trial',renewalDate:'2099-01-01'})).status,200);
 assert.equal((await api('/api/company/agent',ownerToken,{tenantId,services:'خدمة اختبار فعلية في المحاكي',savedReplies:'مواعيد العمل | من 9 إلى 5'})).status,200);
 assert.equal((await api('/api/company/agent?tenantId='+tenantId,ownerToken)).data.settings.services,'خدمة اختبار فعلية في المحاكي');
 const preview=await api('/api/company/replies/preview',ownerToken,{tenantId,text:'مواعيد العمل'});assert.equal(preview.status,200);assert.equal(preview.data.reply,'من 9 إلى 5');assert.equal(preview.data.sent,false);
 assert.equal((await api('/api/company/orders',ownerToken,{tenantId,customerName:'عميل الاختبار',contact:'emulator-only',details:'طلب عبر خادم Node وFirestore'})).status,201);
 assert.equal((await api('/api/company/orders?tenantId='+tenantId,ownerToken)).data.orders.length,1);
 assert.equal((await api('/api/public/message',null,{widgetId:created.data.widgetId,text:'not sent'})).status,503);
 const localSession={tenantId,account:'201000000000@s.whatsapp.net',sessionId:'a'.repeat(32)};
 assert.equal((await api('/api/company/local-whatsapp/bind',ownerToken,localSession)).status,200);
 const incoming={...localSession,messageId:'TEST_LOCAL_001',from:'201111111111@s.whatsapp.net',text:'مواعيد العمل',timestamp:Date.now()};
 const synced=await api('/api/company/local-whatsapp/inbox',ownerToken,incoming);assert.equal(synced.status,200);assert.equal(synced.data.sent,false);
 assert.equal((await api('/api/company/local-whatsapp/inbox',ownerToken,incoming)).data.duplicate,true);
 assert.equal((await api('/api/company/whatsapp/drafts?tenantId='+tenantId,ownerToken)).data.drafts[0].source,'local_qr');
 await auth.updateUser('company-owner',{disabled:true});
 assert.equal((await api('/api/company?tenantId='+tenantId,ownerToken)).status,401);
});

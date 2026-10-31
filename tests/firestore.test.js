'use strict';
// Runs only against a local Firestore emulator; never accesses bright-33420.
const {test}=require('node:test'),assert=require('node:assert/strict');
const {reserveAi}=require('../cloud/security');const {PLANS}=require('../cloud/service');
const enabled=process.env.FIRESTORE_EMULATOR_HOST==='127.0.0.1:8085';
test('Real Firestore emulator: atomic shared quota and deny browser access',{skip:!enabled},async t=>{
 const sdk=require('node:module').createRequire(require('node:path').resolve(__dirname,'../cloud/package.json'));
 const {initializeApp,deleteApp}=sdk('firebase-admin/app'),{getFirestore}=sdk('firebase-admin/firestore');
 const app=initializeApp({projectId:'demo-bright-ai'});t.after(()=>deleteApp(app));
 const db=getFirestore(app),tenant=db.collection('brightAiTenants').doc('emulator-company');
 await tenant.set({plan:'starter',subscriptionStatus:'active',renewalDate:'2099-01-01'});
 const usage=tenant.collection('usage').doc(new Date().toISOString().slice(0,7));await usage.set({reserved:499});
 const attempts=await Promise.allSettled(Array.from({length:5},()=>reserveAi({db,tenantRef:tenant,plans:PLANS})));
 assert.equal(attempts.filter(x=>x.status==='fulfilled').length,1);assert.equal((await usage.get()).data().reserved,500);
 const url='http://127.0.0.1:8085/v1/projects/demo-bright-ai/databases/(default)/documents/brightAiTenants/emulator-company';
 assert.equal((await fetch(url)).status,403);
 assert.equal((await fetch(url,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({fields:{name:{stringValue:'forged'}}})})).status,403);
});

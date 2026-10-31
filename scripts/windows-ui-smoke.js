'use strict';
const assert=require('node:assert/strict'),http=require('node:http');
const {_electron}=require('../desktop/node_modules/playwright');
const {makeService}=require('../cloud/service');const {memoryStore}=require('../tests/memory-store');
(async()=>{
 const electron=await _electron.launch({executablePath:process.env.BRIGHT_INSTALLED_EXE,args:[],timeout:30000});let server;
 try{
  const page=await electron.firstWindow();await page.waitForSelector('#connect');
  assert.equal(await page.locator('h1').textContent(),'Bright Ai');
  await page.locator('#server').fill('http://127.0.0.1:8080/console/');await page.locator('#submit').click();
  await page.waitForFunction(()=>document.getElementById('status').textContent.includes('تعذر'));
  await page.screenshot({path:'artifacts/windows-setup.png'});
  // UI acceptance with fake Auth/storage only. No real accounts or external requests.
  const db=memoryStore(),tenant=db.collection('brightAiTenants').doc('company001');
  await tenant.set({name:'شركة اختبار Bright',plan:'starter',subscriptionStatus:'trial',renewalDate:'2099-01-01',memberUids:['owner001'],agentSettings:{services:'خدمة اختبار'}});
  await tenant.collection('members').doc('owner001').set({active:true,role:'owner'});
  server=http.createServer(makeService({db,admin:{firestore:{FieldValue:{serverTimestamp:()=>new Date().toISOString()}}},auth:{verifyIdToken:async uid=>({uid,brightSuperAdmin:uid==='superuser'}),getUser:async uid=>({uid})}}));
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const url='http://127.0.0.1:'+server.address().port+'/console/';
  await page.route('https://www.gstatic.com/firebasejs/**/firebase-app.js',route=>route.fulfill({contentType:'text/javascript',body:'export const initializeApp=()=>({});'}));
  await page.route('https://www.gstatic.com/firebasejs/**/firebase-auth.js',route=>route.fulfill({contentType:'text/javascript',body:`let callback;const auth={currentUser:null};export const getAuth=()=>auth;export const onAuthStateChanged=(a,cb)=>{callback=cb;queueMicrotask(()=>cb(null));};export const signInWithEmailAndPassword=async(a,email)=>{const uid=email==='admin@test.example'?'superuser':'owner001';auth.currentUser={uid,getIdToken:async()=>uid};await callback(auth.currentUser);};export const signOut=async()=>{auth.currentUser=null;await callback(null);};export const sendPasswordResetEmail=async()=>{};`}));
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await electron.evaluate(({BrowserWindow},url)=>BrowserWindow.getAllWindows()[0].loadURL(url),url);
  await page.locator('#email').fill('owner@test.example');await page.locator('#password').fill('test-only');await page.locator('#signin').click();
  await page.waitForFunction(()=>document.getElementById('metrics').textContent.includes('شركة اختبار Bright'));
  await page.waitForFunction(()=>document.getElementById('status').textContent.includes('تم تحميل البيانات'));
  assert.equal(await page.locator('#adminPanel').isVisible(),false);
  await page.locator('#services').fill('خدمة جديدة للاختبار');await page.locator('#saveAgent').click();await page.waitForFunction(()=>document.getElementById('status').textContent.includes('حفظ الإعدادات'));
  assert.equal((await tenant.get()).data().agentSettings.services,'خدمة جديدة للاختبار');
  await page.locator('#orderCustomer').fill('عميل اختبار');await page.locator('#orderContact').fill('test-only');await page.locator('#orderDetails').fill('طلب تجريبي من واجهة Windows');await page.locator('#createOrder').click();
  await page.waitForFunction(()=>document.getElementById('orders').textContent.includes('طلب تجريبي من واجهة Windows'));
  await page.locator('#memberUid').fill('staff001');await page.locator('#saveMember').click();await page.waitForFunction(()=>document.getElementById('status').textContent.includes('حفظ صلاحية الموظف'));
  assert.equal((await tenant.collection('members').doc('staff001').get()).data().active,true);
  await page.screenshot({path:'artifacts/windows-company-ui.png',fullPage:true});
  await page.locator('#logout').click();await page.locator('#email').fill('admin@test.example');await page.locator('#password').fill('test-only');await page.locator('#signin').click();await page.waitForSelector('#adminPanel',{state:'visible'});
  assert.equal(errors.length,0,errors.join('\n'));console.log('Installed setup + company/admin UI smoke passed with isolated Auth/storage doubles.');
 }finally{await electron.close();if(server)await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});

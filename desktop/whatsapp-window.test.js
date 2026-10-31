'use strict';
const assert=require('node:assert/strict');const {WHATSAPP_URL,createWhatsAppLauncher}=require('./whatsapp-window');
(async()=>{
 let called=[],finish;const open=createWhatsAppLauncher({shell:{openExternal:url=>{called.push(url);return new Promise(r=>finish=r);}},dialog:{showErrorBox(){throw Error('unexpected dialog')}}});
 const first=open('https://evil.test/');const second=open();assert.equal(first,second);await Promise.resolve();assert.deepEqual(called,[WHATSAPP_URL]);finish();assert.equal((await first).opened,true);
 let errorShown=false;const fail=createWhatsAppLauncher({shell:{openExternal:async()=>{throw Error('no browser')}},dialog:{showErrorBox:()=>errorShown=true}});assert.equal((await fail()).opened,false);assert(errorShown);console.log('WhatsApp fixed browser destination, duplicate-click and error handling passed');
})().catch(e=>{console.error(e);process.exitCode=1;});

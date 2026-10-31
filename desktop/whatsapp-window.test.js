'use strict';
const assert=require('node:assert/strict');
const {allowedWhatsAppNavigation,PARTITION,createWhatsAppWindow}=require('./whatsapp-window');
assert(allowedWhatsAppNavigation('https://web.whatsapp.com/'));
for(const url of ['http://web.whatsapp.com/','https://web.whatsapp.com.evil.test/','https://web.whatsapp.com@evil.test/','file:///etc/passwd','https://user:pass@web.whatsapp.com/'])assert.equal(allowedWhatsAppNavigation(url),false);
(async()=>{
 let options,loaded,handler,permission,partition;const events={};
 class Window{constructor(o){options=o;this.webContents={setWindowOpenHandler:f=>handler=f,on:(n,f)=>events[n]=f};}on(){}async loadURL(u){loaded=u;}isDestroyed(){return false;}show(){}focus(){}}
 const open=createWhatsAppWindow({BrowserWindow:Window,session:{fromPartition:p=>{partition=p;return {setPermissionRequestHandler:f=>permission=f,setPermissionCheckHandler(){},on(){}};}},dialog:{showErrorBox(){}}});
 const first=await open();assert.equal(await open(),first);assert.equal(partition,PARTITION);assert.equal(loaded,'https://web.whatsapp.com/');assert.equal(options.webPreferences.preload,undefined);assert.equal(options.webPreferences.nodeIntegration,false);assert.equal(options.webPreferences.sandbox,true);assert.equal(handler().action,'deny');let grant;permission(null,'camera',x=>grant=x);assert.equal(grant,false);let denied=false;events['will-navigate']({preventDefault:()=>denied=true},'https://evil.test');assert(denied);console.log('WhatsApp isolated window and navigation policy passed');
})().catch(e=>{console.error(e);process.exitCode=1;});

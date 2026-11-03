'use strict';
const {app,BrowserWindow,dialog,session,ipcMain,shell,safeStorage,WebContentsView}=require('electron');
const fs=require('node:fs');
const path=require('node:path');
const {cloudTarget}=require('./config');
const {createWhatsAppLauncher}=require('./whatsapp-window');
const {createLocalWhatsApp}=require('./local-whatsapp');
const {allowedNavigation}=require('./url-policy');
let win,target,configPath;
if(!app.requestSingleInstanceLock())app.exit(0);
function settings(){
 target=null;
 win.loadFile(path.join(__dirname,'setup.html')).catch(()=>dialog.showErrorBox('Bright Ai','تعذر عرض الإعدادات'));
}
async function openConsole(value){
 const next=new URL(cloudTarget(value));
 target=next;
 try{await win.loadURL(next.toString());}
 catch{settings();dialog.showErrorBox('Bright Ai','تعذر الاتصال بالخادم. راجع الرابط والإنترنت ثم حاول مجددًا.');throw Error('تعذر الاتصال بالخادم');}
}
app.whenReady().then(()=>{
 configPath=path.join(app.getPath('userData'),'server.json');
 session.defaultSession.setPermissionRequestHandler((_wc,_permission,callback)=>callback(false));
 win=new BrowserWindow({title:'Bright Ai',width:1280,height:850,minWidth:800,minHeight:600,webPreferences:{preload:path.join(__dirname,'preload.js'),nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true}});
 win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
 const guard=(e,url)=>{if(!target||!allowedNavigation(target,url))e.preventDefault();};
 win.webContents.on('will-navigate',guard);win.webContents.on('will-redirect',guard);
 win.webContents.on('will-attach-webview',e=>e.preventDefault());
 session.defaultSession.on('will-download',e=>e.preventDefault());
 const trusted=event=>event.sender===win.webContents&&event.senderFrame===win.webContents.mainFrame&&event.senderFrame.url===require('node:url').pathToFileURL(path.join(__dirname,'setup.html')).href;
 ipcMain.handle('bright:connect',async(event,value)=>{
  if(!trusted(event))throw Error('Access denied');
  const url=cloudTarget(value);await openConsole(url);
  fs.writeFileSync(configPath,JSON.stringify({url}));return {ok:true};
 });
 const openWhatsApp=createWhatsAppLauncher({shell,dialog});
 const whatsappInterface=require('./whatsapp-interface').createWhatsAppInterface({BrowserWindow,WebContentsView,session,ipcMain,parent:win,openExternal:openWhatsApp});
 const localWhatsApp=createLocalWhatsApp({safeStorage,userData:app.getPath('userData'),emit:(kind,data)=>{if(!win.isDestroyed())win.webContents.send('bright:wa:'+kind,data);}});
 const trustedConsole=event=>{try{return event.sender===win.webContents&&event.senderFrame===win.webContents.mainFrame&&target&&new URL(event.senderFrame.url).origin===target.origin&&new URL(event.senderFrame.url).pathname.startsWith('/console/');}catch{return false;}};
 ipcMain.handle('bright:wa:web:open',async(event,input)=>{if(!trustedConsole(event))throw Error('Access denied');return whatsappInterface.open({tenantId:String(input?.tenantId||''),uid:String(input?.uid||''),origin:target.origin});});
 ipcMain.handle('bright:wa:web:close',event=>{if(!trustedConsole(event))throw Error('Access denied');whatsappInterface.close();});
 ipcMain.handle('bright:wa:start',async(event,input)=>{if(!trustedConsole(event))throw Error('Access denied');return localWhatsApp.start({tenantId:String(input?.tenantId||''),uid:String(input?.uid||''),autoReplyEnabled:input?.autoReplyEnabled===true,origin:target.origin});});
 ipcMain.handle('bright:wa:reply',async(event,input)=>{if(!trustedConsole(event))throw Error('Access denied');return localWhatsApp.reply(input);});
 ipcMain.handle('bright:wa:human-drain',async(event,input)=>{if(!trustedConsole(event))throw Error('Access denied');return localWhatsApp.humanDrain(input);});
 ipcMain.handle('bright:wa:ack',(event,input)=>{if(!trustedConsole(event))throw Error('Access denied');return localWhatsApp.ack(input);});
 ipcMain.handle('bright:wa:stop',event=>{if(!trustedConsole(event))throw Error('Access denied');return localWhatsApp.stop();});
 win.webContents.on('will-navigate',()=>{localWhatsApp.stop();whatsappInterface.close();});win.on('closed',()=>localWhatsApp.stop());
 const {Menu}=require('electron');
 Menu.setApplicationMenu(Menu.buildFromTemplate([{label:'Bright Ai',submenu:[{label:'واتساب — ربط QR في متصفح الجهاز',click:()=>openWhatsApp()},{type:'separator'},{label:'إعداد عنوان الخادم',click:settings},{label:'إعادة التحميل',role:'reload'},{type:'separator'},{role:'quit',label:'خروج'}]}]));
 let saved;try{saved=JSON.parse(fs.readFileSync(configPath,'utf8')).url;}catch{}
 if(saved)openConsole(saved).catch(()=>{});else settings();
});
app.on('window-all-closed',()=>{if(process.platform!=='darwin')app.quit();});

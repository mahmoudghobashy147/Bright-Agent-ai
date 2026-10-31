'use strict';
const WHATSAPP_URL='https://web.whatsapp.com/';
const PARTITION='persist:bright-whatsapp-manual';
function allowedWhatsAppNavigation(value){try{const u=new URL(value);return u.origin==='https://web.whatsapp.com'&&!u.username&&!u.password;}catch{return false;}}
function createWhatsAppWindow({BrowserWindow,session,dialog}){
 let window;
 return async function open(){
  if(window&&!window.isDestroyed()){window.show();window.focus();return window;}
  const isolated=session.fromPartition(PARTITION);
  isolated.setPermissionRequestHandler((_wc,_permission,callback)=>callback(false));
  isolated.setPermissionCheckHandler(()=>false);
  isolated.on('will-download',event=>event.preventDefault());
  window=new BrowserWindow({title:'Bright Ai — WhatsApp',width:1200,height:850,minWidth:800,minHeight:600,webPreferences:{partition:PARTITION,nodeIntegration:false,nodeIntegrationInWorker:false,contextIsolation:true,sandbox:true,webSecurity:true,webviewTag:false}});
  window.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  const guard=(event,url)=>{if(!allowedWhatsAppNavigation(url))event.preventDefault();};
  window.webContents.on('will-navigate',guard);window.webContents.on('will-redirect',guard);
  window.webContents.on('will-attach-webview',event=>event.preventDefault());
  window.on('closed',()=>{window=null;});
  try{await window.loadURL(WHATSAPP_URL);}catch{dialog.showErrorBox('Bright Ai — WhatsApp','تعذر تحميل واتساب. تحقق من الإنترنت. جلسة واتساب لم يتم ربطها تلقائيًا.');}
  return window;
 };
}
module.exports={WHATSAPP_URL,PARTITION,allowedWhatsAppNavigation,createWhatsAppWindow};

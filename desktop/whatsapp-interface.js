'use strict';
const path=require('node:path'),{pathToFileURL}=require('node:url'),{createHash}=require('node:crypto');
const URL='https://web.whatsapp.com/';
function allowedWhatsApp(value){try{const u=new global.URL(value);return u.origin==='https://web.whatsapp.com'&&!u.username&&!u.password;}catch{return false;}}
function chromiumUserAgent(value){return String(value).replace(/\s(?:Electron|bright-ai-desktop|Bright(?:\sAi)?[^\s]*)\/\S+/g,'');}
function companyPartition({tenantId,uid,origin}){if(!/^[a-zA-Z0-9_-]{6,100}$/.test(tenantId)||!/^[a-zA-Z0-9_-]{1,128}$/.test(uid))throw Error('اختر حساب الشركة أولًا');const u=new global.URL(origin);if(u.username||u.password||(u.protocol!=='https:'&&!(u.protocol==='http:'&&u.hostname==='127.0.0.1')))throw Error('Unsafe origin');return 'persist:bright-wa-'+createHash('sha256').update(u.origin+'|'+tenantId+'|'+uid).digest('hex');}
function createWhatsAppInterface({BrowserWindow,WebContentsView,session,ipcMain,parent,openExternal}){
 let win,view,key,loading=false;
 const localURL=pathToFileURL(path.join(__dirname,'whatsapp-interface.html')).href;
 function trusted(e){return win&&!win.isDestroyed()&&e.sender===win.webContents&&e.senderFrame===win.webContents.mainFrame&&e.senderFrame.url===localURL;}
 function status(text){if(win&&!win.isDestroyed())win.webContents.send('bright:wa:web:status',text);}
 function resize(){if(win&&!win.isDestroyed()&&view){const [width,height]=win.getContentSize();view.setBounds({x:0,y:100,width,height:Math.max(0,height-100)});}}
 async function load(){if(!view||view.webContents.isDestroyed()||loading)return;loading=true;status('جاري تحميل واجهة واتساب…');try{const activeView=view;await activeView.webContents.loadURL(URL);if(view!==activeView)return;status('واجهة واتساب مفتوحة؛ راجع QR أو المحادثات بالأسفل.');}catch{status('تعذر تحميل واتساب. راجع الإنترنت ثم اضغط إعادة التحميل.');}finally{loading=false;}}
 function close(){if(win&&!win.isDestroyed())win.close();}
 async function open(input){
  const next=companyPartition(input);
  if(win&&!win.isDestroyed()&&next===key){win.show();win.focus();return {opened:true};}
  close();key=next;
  const waSession=session.fromPartition(key);waSession.setPermissionRequestHandler((_wc,_p,cb)=>cb(false));waSession.setPermissionCheckHandler(()=>false);waSession.on('will-download',e=>e.preventDefault());
  win=new BrowserWindow({parent,title:'Bright Ai — WhatsApp',width:1200,height:820,minWidth:850,minHeight:600,autoHideMenuBar:true,webPreferences:{preload:path.join(__dirname,'whatsapp-interface-preload.js'),nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true}});
  win.setMenu(null);win.webContents.setWindowOpenHandler(()=>({action:'deny'}));win.webContents.on('will-navigate',e=>e.preventDefault());win.webContents.on('will-attach-webview',e=>e.preventDefault());
  view=new WebContentsView({webPreferences:{session:waSession,nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true}});
  view.webContents.setUserAgent(chromiumUserAgent(waSession.getUserAgent()));
  view.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  for(const event of ['will-navigate','will-redirect'])view.webContents.on(event,(e,url)=>{if(!allowedWhatsApp(url))e.preventDefault();});
  view.webContents.on('will-attach-webview',e=>e.preventDefault());
  view.webContents.on('render-process-gone',()=>status('توقفت واجهة واتساب؛ جرّب إعادة التحميل.'));
  win.contentView.addChildView(view);win.on('resize',resize);resize();
  const ownedWin=win,ownedView=view;win.on('closed',()=>{if(!ownedView.webContents.isDestroyed())ownedView.webContents.close();if(win===ownedWin){win=null;view=null;key=null;loading=false;}});
  await win.loadFile(path.join(__dirname,'whatsapp-interface.html'));void load();return {opened:true};
 }
 ipcMain.handle('bright:wa:web:action',async(e,action)=>{if(!trusted(e))throw Error('Access denied');if(action==='reload'){void load();return;}if(action==='back'){parent.show();parent.focus();close();return;}if(action==='browser')return openExternal();throw Error('Unknown action');});
 parent.on('closed',close);return {open,close};
}
module.exports={allowedWhatsApp,chromiumUserAgent,companyPartition,createWhatsAppInterface};

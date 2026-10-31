'use strict';
const {app,BrowserWindow,dialog,session,ipcMain}=require('electron');
const fs=require('node:fs');
const path=require('node:path');
const {cloudTarget}=require('./config');
const {allowedNavigation}=require('./url-policy');
let win,target,configPath;
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
 const {Menu}=require('electron');
 Menu.setApplicationMenu(Menu.buildFromTemplate([{label:'Bright Ai',submenu:[{label:'إعداد عنوان الخادم',click:settings},{label:'إعادة التحميل',role:'reload'},{type:'separator'},{role:'quit',label:'خروج'}]}]));
 let saved;try{saved=JSON.parse(fs.readFileSync(configPath,'utf8')).url;}catch{}
 if(saved)openConsole(saved).catch(()=>{});else settings();
});
app.on('window-all-closed',()=>{if(process.platform!=='darwin')app.quit();});

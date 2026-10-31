'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
function inbound(message,after){
 const key=message?.key||{},from=String(key.remoteJid||'').replace(/:\d+@/,'@');
 const at=Number(message?.messageTimestamp)*1000;
 if(key.fromMe||!key.id||!/^\d{5,30}@(s\.whatsapp\.net|lid)$/.test(from)||!Number.isFinite(at)||at<after-2000)return null;
 const text=message?.message?.conversation||message?.message?.extendedTextMessage?.text;
 if(typeof text!=='string'||!text.trim())return null;
 return {messageId:String(key.id).slice(0,120),from,text:text.trim().slice(0,1500),timestamp:at};
}
function encryptedAuth({file,safeStorage,lib}){
 if(!safeStorage.isEncryptionAvailable())throw Error('تشفير جلسة واتساب غير متاح على الجهاز');
 let data={creds:lib.initAuthCreds(),keys:{},pending:{}};
 if(fs.existsSync(file))data=JSON.parse(safeStorage.decryptString(fs.readFileSync(file)),lib.BufferJSON.reviver);
 const save=()=>{fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o700});const temp=file+'.tmp';fs.writeFileSync(temp,safeStorage.encryptString(JSON.stringify(data,lib.BufferJSON.replacer)),{mode:0o600});fs.renameSync(temp,file);};
 data.pending||={};
 return {pending:()=>Object.values(data.pending),enqueue:message=>{const id=crypto.createHash('sha256').update(message.from+'|'+message.messageId).digest('hex');if(Object.keys(data.pending).length>=2000&&!data.pending[id])throw Error('queue full');data.pending[id]=message;save();},ack:message=>{delete data.pending[crypto.createHash('sha256').update(message.from+'|'+message.messageId).digest('hex')];save();},state:{creds:data.creds,keys:{get:async(type,ids)=>{const out={};for(const id of ids){let value=data.keys[type+':'+id];if(value&&type==='app-state-sync-key')value=lib.proto.Message.AppStateSyncKeyData.fromObject(value);if(value)out[id]=value;}return out;},set:async updates=>{for(const [type,items] of Object.entries(updates))for(const [id,value] of Object.entries(items)){if(value)data.keys[type+':'+id]=value;else delete data.keys[type+':'+id];}save();}}},save};
}
function createLocalWhatsApp({safeStorage,userData,emit}){
 let socket,generation=0,context=null,after=0,timer,restarts=0,authState,retryTimer;
 const send=(type,data)=>{if(context)emit(type,{...data,tenantId:context.tenantId,uid:context.uid,sessionId:context.sessionId});};
 function stop(){generation++;clearTimeout(timer);clearInterval(retryTimer);context=null;authState=null;if(socket){try{socket.end();}catch{}socket=null;}return {stopped:true};}
 async function start(input){
  stop();if(!/^[a-zA-Z0-9_-]{6,100}$/.test(input.tenantId)||!/^[-_a-zA-Z0-9]{6,128}$/.test(input.uid))throw Error('اختر شركة وسجّل الدخول أولًا');
  context={tenantId:input.tenantId,uid:input.uid,origin:input.origin,sessionId:crypto.randomBytes(16).toString('hex')};after=Date.now();restarts=0;const current=generation;
  const lib=await import('@whiskeysockets/baileys');const QR=require('qrcode');const logger=require('pino')({level:'silent'});
  if(current!==generation)return {stopped:true};
  const file=path.join(userData,'whatsapp-encrypted',crypto.createHash('sha256').update(context.origin+'|'+context.uid+'|'+context.tenantId).digest('hex')+'.bin');
  const auth=encryptedAuth({file,safeStorage,lib});authState=auth;
  const replay=()=>{if(current!==generation||!socket?.user?.id)return;const account=String(socket.user.id).replace(/:\d+@/,'@');for(const message of auth.pending())send('incoming',{...message,account});};
  retryTimer=setInterval(replay,20000);
  function connect(){
   if(current!==generation)return;
   send('status',{state:'connecting',qr:null});
   socket=lib.default({auth:auth.state,logger,markOnlineOnConnect:false,syncFullHistory:false,shouldSyncHistoryMessage:()=>false,generateHighQualityLinkPreview:false});
   const activeSocket=socket;
   socket.ev.on('creds.update',()=>{if(current===generation)try{auth.save();}catch{send('status',{state:'error',error:'تعذر حفظ الجلسة المشفرة'});stop();}});
   socket.ev.on('connection.update',async update=>{
    if(current!==generation||socket!==activeSocket)return;
    try{
     if(update.qr){const qr=await QR.toDataURL(update.qr,{width:270,margin:2});if(current===generation)send('status',{state:'qr',qr});}
     if(update.connection==='open'){const account=String(socket.user?.id||'').replace(/:\d+@/,'@');send('status',{state:'connected',qr:null,account});replay();}
     if(update.connection==='close'){
      const code=update.lastDisconnect?.error?.output?.statusCode;
      if(code===lib.DisconnectReason.restartRequired&&restarts++<3){timer=setTimeout(connect,1000);return;}
      send('status',{state:'disconnected',qr:null,error:code===lib.DisconnectReason.loggedOut?'تم تسجيل الخروج. أعد الربط من جديد.':'انقطع الاتصال. اضغط بدء المزامنة للمحاولة مرة أخرى.'});
     }
    }catch{send('status',{state:'error',qr:null,error:'تعذر تجهيز اتصال واتساب'});}
   });
   socket.ev.on('messages.upsert',event=>{if(current!==generation||socket!==activeSocket||event.type!=='notify')return;const account=String(socket.user?.id||'').replace(/:\d+@/,'@');for(const raw of event.messages||[]){const message=inbound(raw,after);if(message)try{auth.enqueue(message);send('incoming',{...message,account});}catch{send('status',{state:'error',qr:null,error:'تعذر حفظ رسالة في قائمة المزامنة المحلية'});stop();}}});
  }
  connect();return {started:true};
 }
 return {start,stop,ack:input=>{if(context&&input.uid===context.uid&&input.tenantId===context.tenantId&&input.sessionId===context.sessionId){authState?.ack(input);return {ok:true};}throw Error('session changed');}};
}
module.exports={inbound,encryptedAuth,createLocalWhatsApp};

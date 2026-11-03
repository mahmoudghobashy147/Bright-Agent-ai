'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
function inbound(message,after){
 const key=message?.key||{},from=String(key.remoteJid||'').replace(/:\d+@/,'@');
 const at=Number(message?.messageTimestamp)*1000;
 if(key.fromMe||!key.id||!/^\d{5,30}@(s\.whatsapp\.net|lid)$/.test(from)||!Number.isFinite(at)||at<after-2000)return null;
 const image=message?.message?.imageMessage;
 const text=message?.message?.conversation||message?.message?.extendedTextMessage?.text||(image?(image.caption||'[صورة مرفقة]'):null);
 if(typeof text!=='string'||!text.trim())return null;
 return {messageId:String(key.id).slice(0,120),from,text:text.trim().slice(0,1500),timestamp:at,...(image?{media:{kind:'image',id:String(key.id).slice(0,120),sha256:image.fileSha256&&Buffer.from(image.fileSha256).length===32?Buffer.from(image.fileSha256).toString('hex'):null}}:{})};
}
function encryptedAuth({file,safeStorage,lib}){
 if(!safeStorage.isEncryptionAvailable())throw Error('تشفير جلسة واتساب غير متاح على الجهاز');
 let data={creds:lib.initAuthCreds(),keys:{},pending:{}};
 if(fs.existsSync(file))data=JSON.parse(safeStorage.decryptString(fs.readFileSync(file)),lib.BufferJSON.reviver);
 const save=()=>{fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o700});const temp=file+'.tmp';fs.writeFileSync(temp,safeStorage.encryptString(JSON.stringify(data,lib.BufferJSON.replacer)),{mode:0o600});fs.renameSync(temp,file);};
 data.pending||={};data.outbound||={};
 const key=message=>crypto.createHash('sha256').update(message.from+'|'+message.messageId).digest('hex');
 const deliveries={
  beginHuman:message=>{const id=key({...message,messageId:'human_'+message.outboundId});if(data.outbound[id])return {previous:data.outbound[id]};for(const [k,v] of Object.entries(data.outbound))if(v.at<Date.now()-48*3600000)delete data.outbound[k];if(Object.keys(data.outbound).length>=10000)throw Error('سجل الإرسال ممتلئ');data.outbound[id]={status:'unknown',at:Date.now(),claimId:message.claimId};save();return {started:true};},
  completeHuman:(message,result)=>{const id=key({...message,messageId:'human_'+message.outboundId});data.outbound[id]={...data.outbound[id],...result};save();},
  begin:message=>{const id=key(message),previous=data.outbound[id];if(previous)return {previous};const pending=data.pending[id];if(!pending||pending.timestamp<Date.now()-5*60000)throw Error('لا توجد رسالة واردة حديثة لهذا الرد');for(const [k,v] of Object.entries(data.outbound))if(v.at<Date.now()-48*3600000)delete data.outbound[k];if(Object.keys(data.outbound).length>=10000)throw Error('سجل الإرسال ممتلئ');data.outbound[id]={status:'unknown',at:Date.now(),claimId:message.claimId};save();return {started:true};},
  complete:(message,result)=>{data.outbound[key(message)]={...data.outbound[key(message)],...result};save();}
 };
 return {deliveries,pending:()=>Object.values(data.pending),enqueue:message=>{const id=key(message);if(Object.keys(data.pending).length>=2000&&!data.pending[id])throw Error('queue full');data.pending[id]=message;save();},ack:message=>{delete data.pending[key(message)];save();},state:{creds:data.creds,keys:{get:async(type,ids)=>{const out={};for(const id of ids){let value=data.keys[type+':'+id];if(value&&type==='app-state-sync-key')value=lib.proto.Message.AppStateSyncKeyData.fromObject(value);if(value)out[id]=value;}return out;},set:async updates=>{for(const [type,items] of Object.entries(updates))for(const [id,value] of Object.entries(items)){if(value)data.keys[type+':'+id]=value;else delete data.keys[type+':'+id];}save();}}},save};
}
async function loadRuntime(){return {lib:await import('@whiskeysockets/baileys'),QR:require('qrcode'),logger:require('pino')({level:'silent'})};}
function createLocalWhatsApp({safeStorage,userData,emit,runtimeLoader=loadRuntime}){
 let socket,generation=0,context=null,after=0,timer,restarts=0,authState,retryTimer;
 const send=(type,data)=>{if(context)emit(type,{...data,tenantId:context.tenantId,uid:context.uid,sessionId:context.sessionId});};
 function stop(){generation++;clearTimeout(timer);clearInterval(retryTimer);context=null;authState=null;if(socket){try{socket.end();}catch{}socket=null;}return {stopped:true};}
 async function start(input){
  stop();if(!/^[a-zA-Z0-9_-]{6,100}$/.test(input.tenantId)||!/^[-_a-zA-Z0-9]{6,128}$/.test(input.uid))throw Error('اختر شركة وسجّل الدخول أولًا');
  context={tenantId:input.tenantId,uid:input.uid,origin:input.origin,autoReplyEnabled:input.autoReplyEnabled===true,sessionId:crypto.randomBytes(16).toString('hex')};after=Date.now();restarts=0;const current=generation;
  const {lib,QR,logger}=await runtimeLoader();
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
 const matches=input=>context&&input.uid===context.uid&&input.tenantId===context.tenantId&&input.sessionId===context.sessionId;
 async function reply(input){
  if(!matches(input)||!context.autoReplyEnabled)throw Error('الرد التلقائي غير مفعل لهذه الجلسة');
  if(typeof input.reply!=='string'||!input.reply.trim()||input.reply.length>2000||!/^\d{5,30}@(s\.whatsapp\.net|lid)$/.test(input.from)||!/^[a-f0-9]{32}$/.test(input.claimId))throw Error('invalid reply');
  const active=socket,auth=authState;
  if(!active?.user?.id||String(active.user.id).replace(/:\d+@/,'@')!==input.account)throw Error('حساب واتساب غير متصل');
  let content={text:input.reply};
  if(input.media){
   const m=input.media;if(m.mimeType!=='image/jpeg'||typeof m.data!=='string'||m.data.length>1500000||!/^[A-Za-z0-9+/]+={0,2}$/.test(m.data))throw Error('invalid image');
   const bytes=Buffer.from(m.data,'base64');if(bytes.length<4||bytes[0]!==255||bytes[1]!==216||bytes[2]!==255||input.reply.length>1000)throw Error('invalid image payload');
   content={image:bytes,caption:input.reply};
   if(m.jpegThumbnail){if(typeof m.jpegThumbnail!=='string'||m.jpegThumbnail.length>30000||!/^[A-Za-z0-9+/]+={0,2}$/.test(m.jpegThumbnail))throw Error('invalid thumbnail');content.jpegThumbnail=Buffer.from(m.jpegThumbnail,'base64');}
   if(Number.isInteger(m.width)&&m.width>0&&m.width<=2000&&Number.isInteger(m.height)&&m.height>0&&m.height<=2000){content.width=m.width;content.height=m.height;}
  }
  const began=auth.deliveries.begin(input);if(began.previous)return began.previous;
  let timeout,result;
  try{
   const sent=await Promise.race([active.sendMessage(input.from,content),new Promise((_,reject)=>{timeout=setTimeout(()=>reject(Error('delivery timeout')),15000);})]);
   result=sent?.key?.id?{status:'sent',whatsappMessageId:String(sent.key.id)}:{status:'unknown'};
  }catch{result={status:'unknown'};}finally{clearTimeout(timeout);}
  auth.deliveries.complete(input,result);return result;
 }
 async function humanDrain(input){
  if(!matches(input)||!socket?.user?.id||typeof input.token!=='string'||input.token.length>10000)throw Error('جلسة غير متاحة');
  const ctx=context,activeSocket=socket,auth=authState,current=generation,account=String(socket.user.id).replace(/:\d+@/,'@');
  const post=async(action,extra={})=>{const r=await fetch(ctx.origin+'/api/company/local-whatsapp/'+action,{method:'POST',redirect:'error',signal:AbortSignal.timeout(10000),headers:{Authorization:'Bearer '+input.token,'Content-Type':'application/json'},body:JSON.stringify({tenantId:ctx.tenantId,account,sessionId:ctx.sessionId,...extra})});const j=await r.json();if(!r.ok)throw Error('تعذر تجهيز الرد اليدوي');return j;};
  const job=await post('human-claim');if(!job.allowed)return {empty:true};
  if(current!==generation||context!==ctx||socket!==activeSocket||!/^\d{5,30}@(s\.whatsapp\.net|lid)$/.test(job.from)||!/^([a-f0-9]{64})$/.test(job.outboundId)||!/^([a-f0-9]{32})$/.test(job.claimId)||typeof job.reply!=='string'||!job.reply.trim()||job.reply.length>2000)throw Error('رد غير صالح أو جلسة تغيرت');
  const previous=auth.deliveries.beginHuman(job).previous;let result=previous,timer;
  if(!result){try{const sent=await Promise.race([activeSocket.sendMessage(job.from,{text:job.reply}),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('timeout')),15000);})]);result=sent?.key?.id?{status:'sent',whatsappMessageId:String(sent.key.id)}:{status:'unknown'};}catch{result={status:'unknown'};}finally{clearTimeout(timer);}auth.deliveries.completeHuman(job,result);}
  await post('human-result',{outboundId:job.outboundId,claimId:job.claimId,...result});return result;
 }
 return {start,stop,reply,humanDrain,ack:input=>{if(matches(input)){authState?.ack(input);return {ok:true};}throw Error('session changed');}};
}
module.exports={inbound,encryptedAuth,createLocalWhatsApp,loadRuntime};

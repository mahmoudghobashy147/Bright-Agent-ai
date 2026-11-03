'use strict';
const crypto=require('node:crypto');
const {createSavedReplyAgent,normalize}=require('./saved-replies');
const {subscriptionActive}=require('./security');
const {captureInbound,imageMeta}=require('./team-performance');
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
const fail=(message,status=400)=>{throw Object.assign(Error(message),{status});};
const isOptOut=text=>['stop','unsubscribe','الغاء','ايقاف','وقف','لا ترسل','متبعتش','وقف الرسائل'].includes(normalize(text));
const FALLBACK='أهلًا بيك، وصلت رسالتك. فريق الشركة هيراجع طلبك ويرد عليك بالتفاصيل.';
async function localWhatsApp({action,body,user,tenant,db,admin,plans}){
 const root=db.collection('brightAiTenants').doc(body.tenantId),member=await root.collection('members').doc(user.uid).get();
 if(member.data()?.active!==true||!['owner','admin'].includes(member.data()?.role))fail('owner or admin required',403);
 if(!subscriptionActive(tenant))fail('subscription inactive',403);
 const {account,sessionId}=body;
 if(typeof account!=='string'||!/^\d{5,20}@s\.whatsapp\.net$/.test(account)||typeof sessionId!=='string'||!/^[a-f0-9]{32}$/.test(sessionId))fail('invalid local session');
 const accountHash=hash(account),channel=db.collection('brightAiLocalChannels').doc(hash(user.uid+'|'+account)),binding=root.collection('channels').doc('local_qr');
 if(['human-claim','human-result'].includes(action))return require('./human-qr').relayHumanReply({action,db,root,body,user,admin,accountHash,binding});
 if(action==='bind'){
  await db.runTransaction(async tx=>{
   const existing=await tx.get(channel);
   if(existing.exists&&existing.data().tenantId!==body.tenantId)fail('هذا الرقم مرتبط بشركة أخرى',409);
   tx.set(channel,{tenantId:body.tenantId,source:'local_qr',updatedBy:user.uid});
   tx.set(binding,{accountHash,sessionId,autoReplyEnabled:body.autoReplyEnabled===true,updatedBy:user.uid,updatedAt:admin.firestore.FieldValue.serverTimestamp()});
  });return {bound:true,autoReplyEnabled:body.autoReplyEnabled===true,sent:false};
 }
 if(['reply-claim','reply-result'].includes(action)){
  if(typeof body.sourceMessageId!=='string'||!/^[-_a-zA-Z0-9:.]{1,120}$/.test(body.sourceMessageId)||typeof body.from!=='string'||!/^\d{5,30}@(s\.whatsapp\.net|lid)$/.test(body.from))fail('invalid reply source');
  const id=hash(account+'|'+body.from+'|'+body.sourceMessageId),inbox=root.collection('whatsappInbox').doc(id),draft=root.collection('whatsappDrafts').doc('local_'+id),outbox=root.collection('whatsappOutbox').doc('local_'+id),contact=root.collection('localWhatsAppContacts').doc(hash(account+'|'+body.from));
  return db.runTransaction(async tx=>{
   const [bound,message,proposal,delivery,current,person]=await Promise.all([tx.get(binding),tx.get(inbox),tx.get(draft),tx.get(outbox),tx.get(root),tx.get(contact)]);
   if(bound.data()?.accountHash!==accountHash||bound.data()?.sessionId!==sessionId||bound.data()?.updatedBy!==user.uid)fail('local session changed; reconnect',409);
   if(!message.exists||message.data().source!=='local_qr'||message.data().from!==body.from||!proposal.exists)fail('message not found',404);
   const assignment=message.data()?.leadId?await tx.get(root.collection('performanceLeads').doc(message.data().leadId)):null;
   if(action!=='reply-result'&&assignment?.data()?.assignedTo)return {allowed:false,status:'assigned_to_employee'};
   if(action==='reply-result'){
    if(!delivery.exists||delivery.data().sessionId!==sessionId||delivery.data().claimId!==body.claimId)fail('invalid delivery claim',409);
    if(!['sent','unknown'].includes(body.status))fail('invalid delivery status');
    if(body.status==='sent'&&(typeof body.whatsappMessageId!=='string'||!body.whatsappMessageId.trim()||body.whatsappMessageId.length>120))fail('WhatsApp acceptance ID required');
    if(delivery.data().status==='sent')return {recorded:true,status:'sent'};
    const update={status:body.status,updatedAt:admin.firestore.FieldValue.serverTimestamp(),...(body.status==='sent'?{whatsappMessageId:String(body.whatsappMessageId||'').slice(0,120)}:{})};
    tx.update(outbox,update);tx.update(inbox,{status:body.status==='sent'?'replied':'reply_unknown',sent:body.status==='sent'});tx.update(draft,{status:body.status==='sent'?'sent':'reply_unknown'});
    return {recorded:true,status:body.status};
   }
   if(!subscriptionActive(current.data()))fail('subscription inactive',403);
   if(bound.data()?.autoReplyEnabled!==true)return {allowed:false,status:'disabled'};
   if(delivery.exists)return {allowed:false,status:delivery.data().status};
   if(person.data()?.optedOut||isOptOut(message.data().text))return {allowed:false,status:'opted_out'};
   if(message.data().receivedAtMillis<Date.now()-5*60000)return {allowed:false,status:'expired'};
   const reply=proposal.data().requiresReview?FALLBACK:proposal.data().reply,mediaId=proposal.data().mediaId;
   const media=mediaId&&current.data()?.agentSettings?.assistantProfile==='eldalel'?require('./eldalel-media')[mediaId]:null;
   if(typeof reply!=='string'||!reply.trim()||reply.length>2000)fail('invalid reply');
   const claimId=crypto.randomBytes(16).toString('hex');
   // Claim before dispatch, with no automatic reclaim: timeouts may have delivered.
   tx.create(outbox,{source:'local_qr',actorKind:'automation',fromMessageId:id,to:body.from,reply,mediaId:media?mediaId:null,status:'unknown',claimId,sessionId,createdBy:user.uid,createdAt:admin.firestore.FieldValue.serverTimestamp()});
   tx.update(draft,{status:'reply_unknown',outboundReply:reply});tx.update(inbox,{status:'reply_unknown'});
   return {allowed:true,claimId,reply,to:body.from,...(media?{media:{mimeType:media.mimeType,data:media.data,jpegThumbnail:media.jpegThumbnail,width:media.width,height:media.height}}:{})};
  });
 }
 if(action!=='inbox')fail('not found',404);
 const media=imageMeta(body.media);
 const {messageId,from,timestamp}=body;const text=media?(String(body.text||'').trim().slice(0,1500)||'[صورة مرفقة]'):body.text;
 if(typeof messageId!=='string'||!/^[-_a-zA-Z0-9:.]{1,120}$/.test(messageId)||typeof from!=='string'||!/^\d{5,30}@(s\.whatsapp\.net|lid)$/.test(from)||typeof text!=='string'||!text.trim()||text.length>1500||!Number.isSafeInteger(timestamp)||timestamp>Date.now()+30000||timestamp<Date.now()-24*3600000)fail('invalid local text message');
 const id=hash(account+'|'+from+'|'+messageId),inbox=root.collection('whatsappInbox').doc(id),draft=root.collection('whatsappDrafts').doc('local_'+id),usage=root.collection('usage').doc(new Date().toISOString().slice(0,7)),contact=root.collection('localWhatsAppContacts').doc(hash(account+'|'+from));
 if(media){await db.runTransaction(async tx=>{const [bound,existing]=await Promise.all([tx.get(binding),tx.get(inbox)]);if(bound.data()?.accountHash!==accountHash||bound.data()?.sessionId!==sessionId)fail('local session changed; reconnect',409);if(!existing.exists)tx.create(inbox,{from,text,source:'local_qr',accountHash,media,receivedAtMillis:timestamp,createdAt:admin.firestore.FieldValue.serverTimestamp(),status:'image_requires_review',sent:false});});await captureInbound({db,root,inboxId:id,message:{from,text,source:'local_qr',accountHash,media},admin});return {synced:true,messageId:id,draftId:null,sent:false,imageRequiresReview:true};}
 const previous=await contact.get();
 const answer=await createSavedReplyAgent()({message:text,tenant,context:previous.data()?.conversation});
 const duplicate=await db.runTransaction(async tx=>{
  const [bound,existing,month,current]=await Promise.all([tx.get(binding),tx.get(inbox),tx.get(usage),tx.get(root)]);
  if(bound.data()?.accountHash!==accountHash||bound.data()?.sessionId!==sessionId)fail('local session changed; reconnect',409);
  if(!subscriptionActive(current.data()))fail('subscription inactive',403);
  if(existing.exists)return true;
  const count=Number(month.data()?.reserved||0),limit=plans[current.data().plan]?.limit;
  if(!limit||count>=limit)fail('monthly quota exceeded',429);
  tx.set(usage,{reserved:count+1},{merge:true});
  tx.create(inbox,{from,text,source:'local_qr',accountHash,receivedAtMillis:timestamp,createdAt:admin.firestore.FieldValue.serverTimestamp(),status:'awaiting_review',sent:false});
  tx.create(draft,{sourceMessageId:id,reply:answer.reply,mode:answer.mode,requiresReview:answer.requiresReview===true,mediaId:answer.mediaId||null,source:'local_qr',status:'awaiting_review',createdBy:user.uid,createdAt:admin.firestore.FieldValue.serverTimestamp()});
  if(isOptOut(text)||answer.conversation)tx.set(contact,{...(isOptOut(text)?{optedOut:true}:{}),...(answer.conversation?{conversation:answer.conversation}:{}),updatedAt:admin.firestore.FieldValue.serverTimestamp()},{merge:true});
  return false;
 });
 await captureInbound({db,root,inboxId:id,message:{from,text,source:'local_qr',accountHash},admin});
 return {synced:true,duplicate,messageId:id,draftId:draft.id,sent:false};
}
module.exports={localWhatsApp,isOptOut,FALLBACK};

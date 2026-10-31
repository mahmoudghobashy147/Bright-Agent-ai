'use strict';
const crypto=require('node:crypto');
const {createSavedReplyAgent}=require('./saved-replies');
const {subscriptionActive}=require('./security');
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
const fail=(message,status=400)=>{throw Object.assign(Error(message),{status});};
async function localWhatsApp({action,body,user,tenant,db,admin,plans}){
 const root=db.collection('brightAiTenants').doc(body.tenantId),member=await root.collection('members').doc(user.uid).get();
 if(member.data()?.active!==true||!['owner','admin'].includes(member.data()?.role))fail('owner or admin required',403);
 if(!subscriptionActive(tenant))fail('subscription inactive',403);
 const {account,sessionId}=body;
 if(typeof account!=='string'||!/^\d{5,20}@s\.whatsapp\.net$/.test(account)||typeof sessionId!=='string'||!/^[a-f0-9]{32}$/.test(sessionId))fail('invalid local session');
 const accountHash=hash(account),channel=db.collection('brightAiLocalChannels').doc(accountHash),binding=root.collection('channels').doc('local_qr');
 if(action==='bind'){
  await db.runTransaction(async tx=>{
   const existing=await tx.get(channel);
   if(existing.exists&&existing.data().tenantId!==body.tenantId)fail('هذا الرقم مرتبط بشركة أخرى',409);
   tx.set(channel,{tenantId:body.tenantId,source:'local_qr',updatedBy:user.uid});
   tx.set(binding,{accountHash,sessionId,updatedBy:user.uid,updatedAt:admin.firestore.FieldValue.serverTimestamp()});
  });return {bound:true,sent:false};
 }
 if(action!=='inbox')fail('not found',404);
 const {messageId,from,text,timestamp}=body;
 if(typeof messageId!=='string'||!/^[-_a-zA-Z0-9:.]{1,120}$/.test(messageId)||typeof from!=='string'||!/^\d{5,30}@(s\.whatsapp\.net|lid)$/.test(from)||typeof text!=='string'||!text.trim()||text.length>1500||!Number.isSafeInteger(timestamp)||timestamp>Date.now()+30000||timestamp<Date.now()-24*3600000)fail('invalid local text message');
 const id=hash(account+'|'+from+'|'+messageId),inbox=root.collection('whatsappInbox').doc(id),draft=root.collection('whatsappDrafts').doc('local_'+id),usage=root.collection('usage').doc(new Date().toISOString().slice(0,7));
 const answer=await createSavedReplyAgent()({message:text,tenant});
 const duplicate=await db.runTransaction(async tx=>{
  const [bound,existing,month,current]=await Promise.all([tx.get(binding),tx.get(inbox),tx.get(usage),tx.get(root)]);
  if(bound.data()?.accountHash!==accountHash||bound.data()?.sessionId!==sessionId)fail('local session changed; reconnect',409);
  if(!subscriptionActive(current.data()))fail('subscription inactive',403);
  if(existing.exists)return true;
  const count=Number(month.data()?.reserved||0),limit=plans[current.data().plan]?.limit;
  if(!limit||count>=limit)fail('monthly quota exceeded',429);
  tx.set(usage,{reserved:count+1},{merge:true});
  tx.create(inbox,{from,text,source:'local_qr',receivedAtMillis:timestamp,createdAt:admin.firestore.FieldValue.serverTimestamp(),status:'awaiting_review',sent:false});
  tx.create(draft,{sourceMessageId:id,reply:answer.reply,mode:answer.mode,requiresReview:answer.requiresReview===true,source:'local_qr',status:'awaiting_review',createdBy:user.uid,createdAt:admin.firestore.FieldValue.serverTimestamp()});
  return false;
 });
 return {synced:true,duplicate,messageId:id,draftId:draft.id,sent:false};
}
module.exports={localWhatsApp};

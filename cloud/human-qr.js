'use strict';
const crypto=require('node:crypto');const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
const fail=(s,status=400)=>{throw Object.assign(Error(s),{status});};
async function queueHumanReply({db,root,user,messageId,reply,admin}){
 if(!/^[a-f0-9]{64}$/.test(messageId||'')||typeof reply!=='string'||!reply.trim()||reply.length>2000)fail('الرسالة أو الرد غير صحيح');
 const ref=root.collection('whatsappInbox').doc(messageId),job=root.collection('whatsappOutbox').doc(hash('human_qr|'+messageId+'|'+reply.trim()));
 return db.runTransaction(async tx=>{const [member,msg,old]=await Promise.all([tx.get(root.collection('members').doc(user.uid)),tx.get(ref),tx.get(job)]);if(member.data()?.active!==true)fail('الحساب موقوف',403);if(!msg.exists||msg.data().source!=='local_qr')fail('رسالة QR غير موجودة',404);if(!/^[a-f0-9]{64}$/.test(msg.data().accountHash||''))fail('هذه الرسالة تسبق إصدار التتبع. استقبل رسالة جديدة بعد تحديث المزامنة',409);if(!Number.isFinite(msg.data().receivedAtMillis)||Date.now()-msg.data().receivedAtMillis>23*3600000)fail('انتهت نافذة الرد على هذه الرسالة',409);const lead=await tx.get(root.collection('performanceLeads').doc(msg.data().leadId||'missing'));if(!['owner','admin'].includes(member.data().role)&&lead.data()?.assignedTo!==user.uid)fail('العميل ليس مسندًا لهذا الموظف',403);if(old.exists)return {queued:old.data().status==='queued',outboundId:job.id,status:old.data().status,duplicate:true};tx.create(job,{source:'local_qr',actorKind:'human',fromMessageId:messageId,reply:reply.trim(),createdBy:user.uid,status:'queued',accountHash:msg.data().accountHash,to:msg.data().from,createdAtMs:Date.now(),createdAt:admin.firestore.FieldValue.serverTimestamp()});return {queued:true,outboundId:job.id,status:'queued'};});
}
async function relayHumanReply({action,db,root,body,user,admin,accountHash,binding}){
 const now=Date.now();
 if(action==='human-claim'){
  const jobs=await root.collection('whatsappOutbox').where('status','==','queued').limit(5).get();
  for(const doc of jobs.docs){if(doc.data().actorKind!=='human'||doc.data().source!=='local_qr')continue;
   const result=await db.runTransaction(async tx=>{const [bound,job,company]=await Promise.all([tx.get(binding),tx.get(doc.ref),tx.get(root)]);const b=bound.data(),j=job.data();if(b?.accountHash!==accountHash||b?.sessionId!==body.sessionId||b?.updatedBy!==user.uid)fail('جلسة المزامنة تغيرت',409);if(j?.status!=='queued')return null;
    const creator=await tx.get(root.collection('members').doc(j.createdBy)),msg=await tx.get(root.collection('whatsappInbox').doc(j.fromMessageId));
    const lead=msg.data()?.leadId?await tx.get(root.collection('performanceLeads').doc(msg.data().leadId)):null;const contact=await tx.get(root.collection('localWhatsAppContacts').doc(hash(body.account+'|'+j.to)));
    if(contact.data()?.optedOut===true||(!['owner','admin'].includes(creator.data()?.role)&&lead?.data()?.assignedTo!==j.createdBy)||creator.data()?.active!==true||j.accountHash!==accountHash||now-j.createdAtMs>10*60000||!msg.exists||now-msg.data().receivedAtMillis>23*3600000){tx.update(doc.ref,{status:'cancelled',updatedAt:admin.firestore.FieldValue.serverTimestamp()});return null;}
    if(!require('./security').subscriptionActive(company.data()))fail('الاشتراك موقوف',403);
    const claimId=crypto.randomBytes(16).toString('hex');tx.update(doc.ref,{status:'unknown',claimId,relaySessionId:body.sessionId,updatedAt:admin.firestore.FieldValue.serverTimestamp()});return {allowed:true,outboundId:doc.id,claimId,from:j.to,reply:j.reply};
   });if(result)return result;
  }return {allowed:false};
 }
 if(!/^[a-f0-9]{64}$/.test(body.outboundId||'')||!/^[a-f0-9]{32}$/.test(body.claimId||'')||!['sent','unknown'].includes(body.status))fail('نتيجة إرسال غير صحيحة');
 if(body.status==='sent'&&(typeof body.whatsappMessageId!=='string'||!body.whatsappMessageId||body.whatsappMessageId.length>120))fail('معرّف قبول واتساب مطلوب');
 const ref=root.collection('whatsappOutbox').doc(body.outboundId);
 return db.runTransaction(async tx=>{const [bound,job]=await Promise.all([tx.get(binding),tx.get(ref)]);const b=bound.data(),j=job.data();if(b?.accountHash!==accountHash||b?.sessionId!==body.sessionId||b?.updatedBy!==user.uid||j?.relaySessionId!==body.sessionId||j?.claimId!==body.claimId||j?.actorKind!=='human')fail('جلسة أو محاولة إرسال غير صحيحة',409);if(j.status==='sent')return {recorded:true,status:'sent'};tx.update(ref,{status:body.status,...(body.status==='sent'?{sentAtMs:now,whatsappMessageId:body.whatsappMessageId}:{}),updatedAt:admin.firestore.FieldValue.serverTimestamp()});return {recorded:true,status:body.status};});
}
module.exports={queueHumanReply,relayHumanReply};

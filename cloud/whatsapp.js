'use strict';
const crypto=require('node:crypto');
function verifyMetaSignature(raw,header,secret){
 if(!Buffer.isBuffer(raw)||typeof header!=='string'||!/^sha256=[a-f0-9]{64}$/i.test(header)||!secret)return false;
 const expected='sha256='+crypto.createHmac('sha256',secret).update(raw).digest('hex');
 return crypto.timingSafeEqual(Buffer.from(expected),Buffer.from(header.toLowerCase()));
}
function parseIncomingWhatsApp(payload){
 const out=[];
 for(const entry of Array.isArray(payload?.entry)?payload.entry:[])
  for(const change of Array.isArray(entry.changes)?entry.changes:[])
   for(const msg of Array.isArray(change.value?.messages)?change.value.messages:[])
    if(msg.type==='image'&&msg.id&&msg.from&&msg.image?.id){const digest=String(msg.image.sha256||'');const sha256=/^[a-f0-9]{64}$/i.test(digest)?digest.toLowerCase():/^[A-Za-z0-9+/]{43}=$/.test(digest)?Buffer.from(digest,'base64').toString('hex'):null;out.push({id:String(msg.id),from:String(msg.from),text:String(msg.image.caption||'[صورة مرفقة]').slice(0,1500),media:{kind:'image',id:String(msg.image.id).slice(0,120),sha256},phoneNumberId:String(change.value?.metadata?.phone_number_id||''),sentAtMillis:/^\d{10}$/.test(String(msg.timestamp||''))?Number(msg.timestamp)*1000:null});}else if(msg.type==='text'&&msg.id&&msg.from&&msg.text?.body)out.push({id:String(msg.id),from:String(msg.from),text:String(msg.text.body).slice(0,1500),phoneNumberId:String(change.value?.metadata?.phone_number_id||''),sentAtMillis:/^\d{10}$/.test(String(msg.timestamp||''))?Number(msg.timestamp)*1000:null});
 return out;
}
function makeWhatsAppReply(recipient,text){return {messaging_product:'whatsapp',to:recipient,type:'text',text:{body:String(text).slice(0,4096)}};}
module.exports={verifyMetaSignature,parseIncomingWhatsApp,makeWhatsAppReply};

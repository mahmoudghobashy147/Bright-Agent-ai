'use strict';
const {makeWhatsAppReply}=require('./whatsapp');
function withinServiceWindow(timestamp,now=Date.now()){
 return Number.isSafeInteger(timestamp)&&timestamp<=now&&now-timestamp<23*60*60*1000;
}
async function sendWhatsAppText({phoneNumberId,to,text,token,version,fetchImpl=fetch}){
 if(!/^\d{5,30}$/.test(String(phoneNumberId))||!/^\d{6,20}$/.test(String(to)))throw Error('invalid number');
 if(!/^v\d+\.\d+$/.test(String(version))||!token||!text||text.length>2000)throw Error('invalid outbound configuration');
 const response=await fetchImpl(`https://graph.facebook.com/${version}/${phoneNumberId}/messages`,{
 method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify(makeWhatsAppReply(to,text)),signal:AbortSignal.timeout(10000)
 });
 if(!response.ok)throw Error(`Meta API HTTP ${response.status}`);
 const json=await response.json();const messageId=json?.messages?.[0]?.id;
 if(!messageId)throw Error('Meta response did not contain message id');
 return {messageId};
}
module.exports={withinServiceWindow,sendWhatsAppText};

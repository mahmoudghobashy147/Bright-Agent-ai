'use strict';
// Deterministic outbound request ID: repeated button presses cannot create a second send.
const crypto=require('node:crypto');
function requestId(messageId, reply){
 if(typeof messageId!=='string'||!messageId||typeof reply!=='string'||!reply.trim())throw Error('invalid reply request');
 return 'reply_'+crypto.createHash('sha256').update(JSON.stringify([messageId,reply.trim()])).digest('hex');
}
function retryAdvice(status){
 if(status==='sent')return 'already_sent';
 if(status==='pending'||status==='unknown')return 'verify_delivery_before_retry';
 return 'new_text_requires_explicit_approval';
}
module.exports={requestId,retryAdvice};

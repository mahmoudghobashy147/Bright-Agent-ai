'use strict';
const crypto=require('node:crypto');
const {normalizeAutomation}=require('./automation-policy');

// A durable review task, not an outbound message or a charged AI response.
function buildReviewTask({inboundId,tenant,source='whatsapp'}){
 if(typeof inboundId!=='string'||!/^[a-f0-9]{64}$/.test(inboundId))throw Error('invalid inbound id');
 const mode=normalizeAutomation(tenant?.automation).mode;
 if(mode==='off')return null;
 return {id:'review_'+inboundId,record:{source,inboundId,kind:'suggest_reply',status:'pending_preflight',automationMode:mode,createdAtMillis:Date.now(),sent:false}};
}
function isDuplicateCreate(error){return error?.code===6||['already-exists','ALREADY_EXISTS'].includes(error?.code);}
async function createReviewTask({collection,inboundId,tenant}){
 const task=buildReviewTask({inboundId,tenant});
 if(!task)return {queued:false,reason:'disabled'};
 try{await collection.doc(task.id).create(task.record);return {queued:true,id:task.id};}
 catch(error){if(isDuplicateCreate(error))return {queued:false,reason:'duplicate',id:task.id};throw error;}
}
module.exports={buildReviewTask,createReviewTask,isDuplicateCreate};

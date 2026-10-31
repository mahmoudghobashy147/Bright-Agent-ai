'use strict';
const crypto=require('node:crypto');
const LEASE_MS=10*60*1000;
const MAX_ATTEMPTS=3;
function stateForRecovery(task,now=Date.now()){
 if(!task||!Number.isSafeInteger(now))return {recoverable:false,reason:'invalid'};
 if(task.status==='pending_preflight')return {recoverable:true,reason:'pending'};
 if(task.status==='failed')return {recoverable:(task.attempts||0)<MAX_ATTEMPTS,reason:'failed'};
 if(task.status==='generating'){
  const start=task.claimedAtMillis;
  return {recoverable:Number.isSafeInteger(start)&&now-start>=LEASE_MS,reason:'expired_lease'};
 }
 return {recoverable:false,reason:'closed'};
}
function claim(task,uid,now=Date.now()){
 const eligibility=stateForRecovery(task,now);
 if(!eligibility.recoverable)return null;
 const attempts=(task.attempts||0)+1;
 if(attempts>MAX_ATTEMPTS)return null;
 return {status:'generating',claimedBy:uid,claimToken:crypto.randomUUID(),claimedAtMillis:now,attempts,error:null};
}
function belongsToClaim(task,claimToken){return task?.status==='generating'&&typeof claimToken==='string'&&task.claimToken===claimToken;}
module.exports={LEASE_MS,MAX_ATTEMPTS,stateForRecovery,claim,belongsToClaim};

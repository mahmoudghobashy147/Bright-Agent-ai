'use strict';
// Policy-only preflight: does NOT perform or authorize message delivery.
const MODES=new Set(['off','draft_only','manual_review']);
function normalizeAutomation(input={}){
 const mode=typeof input.mode==='string'&&MODES.has(input.mode)?input.mode:'off';
 return {mode,autoSend:false}; // live auto-send deliberately unavailable pre-integration
}
function decideAutomation({settings,subscriptionActive,withinWindow,remainingReplies,customerOptOut}){
 const mode=normalizeAutomation(settings).mode;
 if(mode==='off')return {action:'skip',reason:'automation_disabled'};
 if(!subscriptionActive)return {action:'skip',reason:'inactive_subscription'};
 if(customerOptOut)return {action:'skip',reason:'customer_opted_out'};
 if(!Number.isSafeInteger(remainingReplies)||remainingReplies<1)return {action:'skip',reason:'quota_exhausted'};
 if(!withinWindow)return {action:'skip',reason:'outside_service_window'};
 return {action:'create_draft',reason:mode==='draft_only'?'draft_only':'requires_human_approval'};
}
module.exports={normalizeAutomation,decideAutomation};

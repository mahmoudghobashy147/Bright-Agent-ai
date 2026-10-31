'use strict';
const assert=require('node:assert/strict');
const {normalizeAutomation,decideAutomation}=require('./automation-policy');
assert.deepEqual(normalizeAutomation({mode:'auto',autoSend:true}),{mode:'off',autoSend:false});
for(const mode of ['draft_only','manual_review']){
 const settings=normalizeAutomation({mode,autoSend:true});
 assert.equal(settings.autoSend,false);
 assert.equal(decideAutomation({settings,subscriptionActive:true,withinWindow:true,remainingReplies:5,customerOptOut:false}).action,'create_draft');
 assert.equal(decideAutomation({settings,subscriptionActive:true,withinWindow:true,remainingReplies:5,customerOptOut:true}).action,'skip');
 assert.equal(decideAutomation({settings,subscriptionActive:true,withinWindow:false,remainingReplies:5,customerOptOut:false}).action,'skip');
 assert.equal(decideAutomation({settings,subscriptionActive:true,withinWindow:true,remainingReplies:0,customerOptOut:false}).action,'skip');
}
assert.equal(decideAutomation({settings:{mode:'off'},subscriptionActive:true,withinWindow:true,remainingReplies:3}).action,'skip');
console.log('V19 automation policy tests passed');

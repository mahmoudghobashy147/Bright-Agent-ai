'use strict';
const assert=require('node:assert/strict');
const {buildReviewTask,createReviewTask}=require('./inbox-workflow');
const id='a'.repeat(64);
assert.equal(buildReviewTask({inboundId:id,tenant:{automation:{mode:'off'}}}),null);
const t=buildReviewTask({inboundId:id,tenant:{automation:{mode:'manual_review'}}});
assert.equal(t.id,'review_'+id);assert.equal(t.record.status,'pending_preflight');assert.equal(t.record.sent,false);
assert.throws(()=>buildReviewTask({inboundId:'bad',tenant:{}}));
let count=0;
const collection={doc:key=>({create:async()=>{count++;if(count>1)throw Object.assign(Error('already exists'),{code:6});}})};
(async()=>{
 assert.equal((await createReviewTask({collection,inboundId:id,tenant:{automation:{mode:'draft_only'}}})).queued,true);
 assert.equal((await createReviewTask({collection,inboundId:id,tenant:{automation:{mode:'draft_only'}}})).reason,'duplicate');
 console.log('Inbox workflow tests OK');
})().catch(e=>{console.error(e);process.exitCode=1});

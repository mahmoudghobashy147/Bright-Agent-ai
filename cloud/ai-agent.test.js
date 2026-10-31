'use strict';
const assert=require('node:assert/strict');
const {createAiAgent,extractReply,makeInstructions}=require('./ai-agent');
(async()=>{
 const tenant={name:'شركة اختبار',agentSettings:{services:'تصميم المواقع',guidelines:'تحدث باحترام'}};
 assert.ok(makeInstructions(tenant).includes('تصميم المواقع'));
 assert.equal(extractReply({output:[{content:[{type:'output_text',text:'أهلًا'}]}]}),'أهلًا');
 const inactive=await createAiAgent({apiKey:''})({message:'مرحبًا',tenant});
 assert.equal(inactive.mode,'unconfigured');
 let saved;
 const mock=async(url,opts)=>{saved={url,opts};return {ok:true,json:async()=>({output:[{content:[{type:'output_text',text:'أهلًا بحضرتك'}]}]})};};
 const agent=createAiAgent({apiKey:'test-key',fetchImpl:mock});
 const answer=await agent({message:'عايز موقع',tenant});
 assert.equal(answer.reply,'أهلًا بحضرتك');assert.equal(answer.mode,'openai');
 const body=JSON.parse(saved.opts.body);assert.equal(body.store,false);assert.equal(body.input,'عايز موقع');assert.equal(saved.opts.headers.Authorization,'Bearer test-key');
 const bad=createAiAgent({apiKey:'test-key',fetchImpl:async()=>({ok:false,status:401})});
 assert.equal((await bad({message:'x',tenant})).mode,'fallback');
 console.log('AI adapter tests passed');
})().catch(e=>{console.error(e);process.exitCode=1});

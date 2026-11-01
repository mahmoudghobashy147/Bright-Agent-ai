'use strict';
// Public configuration used by the directory website itself. No cross-project Admin access.
const CONFIG_URL='https://firestore.googleapis.com/v1/projects/eldalel-elshamel/databases/(default)/documents/config/appSettings?mask.fieldPaths=planPrices&mask.fieldPaths=postLimits';
const PLAN_NAMES={starter:'مبتدئ',basic:'أساسي',premium:'مميز',vip:'VIP',company:'شركات',elite:'شركاء النخبة'};
function createKnowledgeLoader(fetchImpl=fetch){
 let cached,expires=0,pending;
 return async()=>{
  if(cached&&Date.now()<expires)return cached;
  if(pending)return pending;
  pending=(async()=>{try{
   const res=await fetchImpl(CONFIG_URL,{signal:AbortSignal.timeout(5000)});if(!res.ok)throw Error('directory settings unavailable');
   const raw=await res.text();if(raw.length>30000)throw Error('oversized settings');const data=JSON.parse(raw);
   const field=name=>data.fields?.[name]?.mapValue?.fields||{};
   const prices=field('planPrices'),posts=field('postLimits');
   const plans=Object.keys(PLAN_NAMES).map(id=>({id,name:PLAN_NAMES[id],price:Number(prices[id]?.integerValue??prices[id]?.doubleValue),posts:Number(posts[id]?.integerValue??posts[id]?.doubleValue)}));
   if(plans.some(p=>!Number.isFinite(p.price)||p.price<0||p.price>100000||!Number.isInteger(p.posts)||p.posts<0||p.posts>10000))throw Error('invalid public prices');
   cached={available:true,plans,fetchedAt:Date.now(),source:'https://eldalel-elshamel.online/'};expires=Date.now()+5*60000;return cached;
  }catch{cached={available:false,plans:[],source:'https://eldalel-elshamel.online/'};expires=Date.now()+60000;return cached;}finally{pending=null;}})();return pending;
 };
}
const loadDirectoryKnowledge=createKnowledgeLoader();
module.exports={createKnowledgeLoader,loadDirectoryKnowledge,PLAN_NAMES};

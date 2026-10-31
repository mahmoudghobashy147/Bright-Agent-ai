'use strict';
// Deterministic company-owned replies. No network calls or model credentials.
const HANDOFF='محتاجين مراجعة فريق الشركة لتأكيد الإجابة. لم يتم إنشاء طلب أو إرسال رسالة تلقائيًا.';
function normalize(value){return String(value??'').normalize('NFKC').toLowerCase().replace(/[\u064B-\u065F\u0670\u0640]/g,'').replace(/[أإآ]/g,'ا').replace(/ى/g,'ي').replace(/[^\p{L}\p{N}]+/gu,' ').trim().replace(/\s+/g,' ');}
function parseRules(value=''){
 if(typeof value!=='string'||value.length>18000)throw Object.assign(Error('قائمة الردود تتجاوز الحد المسموح'),{status:400});
 const lines=value.split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
 if(lines.length>30)throw Object.assign(Error('الحد الأقصى 30 ردًا محفوظًا'),{status:400});
 const seen=new Set();
 return lines.map(line=>{
  const at=line.indexOf('|'),question=line.slice(0,at).trim(),reply=line.slice(at+1).trim(),key=normalize(question);
  if(at<0||key.length<3||question.length>120||!reply||reply.length>500||seen.has(key))throw Object.assign(Error('كل سطر: عبارة فريدة من 3 أحرف على الأقل | إجابة حتى 500 حرف'),{status:400});
  seen.add(key);return {question,reply,key};
 });
}
function createSavedReplyAgent(){return async({message,tenant})=>{
 const key=normalize(message),settings=tenant.agentSettings||{};
 let rules;try{rules=parseRules(settings.savedReplies||'');}catch{return {reply:HANDOFF,mode:'saved_review',requiresReview:true};}
 const matches=rules.filter(rule=>key===rule.key||(' '+key+' ').includes(' '+rule.key+' ')||(' '+key+' ').includes(' و'+rule.key+' '));
 const answers=[...new Set(matches.map(rule=>rule.reply))];
 if(answers.length===1)return {reply:answers[0],mode:'saved_reply',requiresReview:false};
 if(!matches.length&&['اهلا','اهلا بيك','مرحبا','السلام عليكم','صباح الخير','مساء الخير'].includes(key))return {reply:String(settings.greeting||'أهلًا بيك، نقدر نساعدك إزاي؟').slice(0,500),mode:'saved_reply',requiresReview:false};
 return {reply:HANDOFF,mode:'saved_review',requiresReview:true};
};}
module.exports={normalize,parseRules,createSavedReplyAgent,HANDOFF};

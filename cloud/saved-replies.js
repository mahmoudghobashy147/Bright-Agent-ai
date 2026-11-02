'use strict';
// Deterministic company-owned replies. No network calls or model credentials.
const HANDOFF='محتاجين مراجعة فريق الشركة لتأكيد الإجابة. لم يتم إنشاء طلب أو إرسال رسالة تلقائيًا.';
const {normalize,has,answerEldalel}=require('./eldalel-assistant');
const {loadDirectoryKnowledge}=require('./eldalel-knowledge');
const {answerSmartDigital,intents:smartIntents}=require('./smart-digital-assistant');
function parseRules(value=''){
 if(typeof value!=='string'||value.length>250000)throw Object.assign(Error('قائمة الردود تتجاوز الحد المسموح'),{status:400});
 const lines=value.split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
 if(lines.length>200)throw Object.assign(Error('الحد الأقصى 200 رد محفوظ'),{status:400});
 const seen=new Set();
 return lines.map(line=>{
  const at=line.indexOf('|'),question=line.slice(0,at).trim(),reply=line.slice(at+1).trim(),key=normalize(question);
  if(at<0||key.length<3||question.length>120||!reply||reply.length>1000||seen.has(key))throw Object.assign(Error('كل سطر: عبارة فريدة من 3 أحرف على الأقل | إجابة حتى 1000 حرف'),{status:400});
  seen.add(key);return {question,reply,key};
 });
}
function createSavedReplyAgent({knowledgeLoader=loadDirectoryKnowledge}={}){return async({message,tenant,context})=>{
 const key=normalize(message),settings=tenant.agentSettings||{};
 let rules;try{rules=parseRules(settings.savedReplies||'');}catch{return {reply:HANDOFF,mode:'saved_review',requiresReview:true};}
 if(settings.assistantProfile==='smart_digital'){
  const answer=answerSmartDigital({message,context}),exact=rules.find(rule=>rule.key===key);
  const presetDefault=exact&&smartIntents.some(i=>i.reply===exact.reply&&normalize(i.aliases[0])===exact.key);
  return exact&&!presetDefault?{...answer,reply:exact.reply}:answer;
 }
 let directoryAnswer;
 if(settings.assistantProfile==='eldalel'){
  const planQuestion=has(key,['باقات','باقة','اشتراك'])||context?.topic==='plans';
  directoryAnswer=answerEldalel({message,context,knowledge:planQuestion?await knowledgeLoader():{available:false}});
  if(directoryAnswer.mediaId||planQuestion||has(key,['سعر','اسعار','بكام','تكلفة','كام']))return directoryAnswer;
 }
 const matches=rules.filter(rule=>key===rule.key||has(key,[rule.key]));
 const answers=[...new Set(matches.map(rule=>rule.reply))];
 if(answers.length===1)return {reply:answers[0],mode:'saved_reply',requiresReview:false};
 if(directoryAnswer)return directoryAnswer;
 if(!matches.length&&['اهلا','اهلا بيك','مرحبا','السلام عليكم','صباح الخير','مساء الخير'].includes(key))return {reply:String(settings.greeting||'أهلًا بيك، نقدر نساعدك إزاي؟').slice(0,500),mode:'saved_reply',requiresReview:false};
 return {reply:HANDOFF,mode:'saved_review',requiresReview:true};
};}
module.exports={normalize,parseRules,createSavedReplyAgent,HANDOFF};

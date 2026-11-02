'use strict';
const {normalize,has}=require('./eldalel-assistant');
const {intents,benefits}=require('./smart-digital-library');
const byId=new Map(intents.map(i=>[i.id,i]));
const canonical=v=>normalize(v).split(' ').map(w=>w.replace(/^و(?=.{3})/,'').replace(/^ال(?=.{3})/,'')).join(' ');
function ranked(message){const key=canonical(message);return intents.map(intent=>{let score=0;for(const alias of intent.aliases){const a=canonical(alias);if((' '+key+' ').includes(' '+a+' '))score=Math.max(score,a.split(' ').length*100+a.length);else if(has(normalize(message),[alias]))score=Math.max(score,a.split(' ').length*50+a.length);}return {intent,score};}).filter(x=>x.score).sort((a,b)=>b.score-a.score);}
function answerSmartDigital({message,context={},now=Date.now()}){
 const key=normalize(message),match=p=>has(key,p),valid=context.profile==='smart_digital'&&Number.isFinite(context.at)&&context.at<=now&&now-context.at<24*3600000&&byId.has(context.intentId),previous=valid?byId.get(context.intentId):null;
 let selected=ranked(message)[0]?.intent,reply,topic=selected?.topic||previous?.topic||'general',intentId=selected?.id||previous?.id||'overview';
 const business=['نجار','سباك','كهربائي','نقاش','مطعم','كافيه','عيادة','محل','مصنع','مورد','شركة'].find(b=>match([b]));
 const slots={...(valid?context.slots||{}:{}),...(business?{business}:{})};
 const explicitTopic=[['stores',['متجر','متاجر']],['websites',['موقع','مواقع']],['social',['سوشيال','صفحات']],['ads',['اعلان','اعلانات']],['domain',['دومين']],['hosting',['استضافة']],['video',['فيديو','ريلز']],['design',['تصميم']],['maintenance',['صيانة']]].find(([,aliases])=>match(aliases))?.[0];
 const rootByTopic={stores:'store',websites:'website',social:'social',ads:'ads',domain:'domain',hosting:'hosting',video:'reels',design:'design',maintenance:'maintenance'};
 // Short follow-ups use this company's own prior path, never another profile's context.
 if(match(['مش عايز','مش مهتم','مش محتاج'])&&!match(['غير','بس'])){reply='تمام، مش هنعتبر ده طلب خدمة. تحب توضح إيه اللي مناسب ليك أو نوقف الكلام هنا؟';}
 else if(!selected&&match(['وضح اكتر','اشرح اكتر','فيدني اكتر','تفاصيل اكتر','مش فاهم','يعني ايه','كمل','طب وبعدين','تفاصيل','فهمني','شغاله ازاي','النظام ايه','النظام عندكم'])){reply=previous?previous.detail:'أكيد، تحب تفاصيل عن موقع أو متجر، إدارة صفحات وإعلانات، ولا تصميم وفيديو؟ قولّي الخدمة ونشرحها خطوة خطوة.';}
 else if(!selected&&match(['اعملها ليه','فايدتها ايه','هتفيدني ازاي','ليه محتاجها','لزمتها ايه']))reply=benefits[topic]||'الفايدة حسب هدفك: عرض خدمات وأعمال، تنظيم بيع منتجات، أو تعريف جمهور مناسب بنشاطك. قولّي النشاط والخدمة علشان أوضح الأنسب، من غير وعد بمبيعات.';
 else if(selected){
  reply=selected.reply;
  const scopeBase=explicitTopic?byId.get(rootByTopic[explicitTopic]):previous;
  if(['price','deadline','discount','included','renewal','extra_costs'].includes(selected.id)&&scopeBase&&scopeBase.topic!=='general'){
   topic=scopeBase.topic;intentId=scopeBase.id;
   const scope={websites:'الموقع',stores:'المتجر',social:'إدارة الصفحات',ads:'الإعلان',design:'التصميم',branding:'الهوية',video:'الفيديو',domain:'الدومين',hosting:'الاستضافة',maintenance:'الصيانة'}[topic];
   if(scope)reply='بخصوص '+scope+': '+reply;
  }
  // Two explicit questions can be answered together; ambiguous or broad overlaps stay one path.
  const second=ranked(message).find(x=>x.intent.id!==selected.id&&['deadline','price','ownership','renewal','revisions'].includes(x.intent.id)&&x.score>=100&&x.intent.topic!==selected.topic)?.intent;
  const compound=/(?:^|\s)و(?:\s|بيخلص|بكام|السعر|التكلف|هستلم|التجديد|ملكي|كام|تعديلات)/u.test(key);
  if(compound&&second&&reply.length+second.reply.length<950)reply+='\n\n'+second.reply;
 }
 else if(business){reply='تمام، نشاطك '+business+'. '+(benefits[topic]||'نقدر نراجع طريقة عرض خدماتك أو منتجاتك والتواصل مع العملاء.')+' هدفك الأساسي طلبات جديدة، عرض شغلك، ولا تنظيم البيع؟';}
 else if(match(['تمام','ماشي','اه','ايوه','حلو','موافق']))reply=previous?'تمام، خلّينا نكمل المطلوب: '+(topic==='stores'?'نوع المنتجات وعددها التقريبي وطريقة استقبال الطلبات.':topic==='ads'?'نوع النشاط وهدف الحملة والميزانية التقريبية، من غير بدء إنفاق.':'نوع النشاط والمخرجات المطلوبة والموعد المستهدف. ما اتأكدش حجز أو تنفيذ لسه.'):'تمام، تحب نبدأ بأنهي خدمة ونشاطك إيه؟';
 else reply='محتاج أفهم قصدك أكتر علشان أجاوبك صح. بتسأل عن موقع أو متجر، سوشيال وإعلانات، تصميم وفيديو، ولا متابعة طلب قائم؟ لو تقصد '+(previous?'آخر خدمة كنا بنتكلم عنها':'حاجة محددة')+' وضّح النقطة اللي محتاجها.';
 return {reply,mode:'saved_reply',requiresReview:false,topic,intentId,conversation:{profile:'smart_digital',topic,intentId,slots:{...(typeof slots.business==='string'?{business:slots.business.slice(0,40)}:{})},at:now}};
}
module.exports={answerSmartDigital,ranked,intents};

'use strict';
const {normalize,has}=require('./eldalel-assistant'),{profiles}=require('./trade-library');
const canonical=v=>normalize(v).split(' ').map(w=>w.replace(/^و(?=.{3})/,'').replace(/^ال(?=.{3})/,'')).join(' ');
const cities=['القاهرة','الجيزة','الاسكندرية','القليوبية','الشرقية','الدقهلية','الغربية','المنوفية','البحيرة','كفر الشيخ','دمياط','بورسعيد','الاسماعيلية','السويس','الفيوم','بني سويف','المنيا','اسيوط','سوهاج','قنا','الاقصر','اسوان','مطروح','البحر الاحمر','الوادي الجديد','شمال سيناء','جنوب سيناء'];
const materials=['سيراميك','بورسلين','رخام','خشب','حديد','اسمنت','رمل','زلط','دهانات','مواسير','ادوات صحية','كابلات','جبس','عزل'];
function rankTrade(profile,message){
 const p=profiles[profile];if(!p)return [];const key=canonical(message);
 return p.intents.map(intent=>{let score=0;for(const alias of intent.aliases){const a=canonical(alias);if((' '+key+' ').includes(' '+a+' '))score=Math.max(score,a.split(' ').length*100+a.length);else if(has(normalize(message),[alias]))score=Math.max(score,a.split(' ').length*50+a.length);}return {intent,score};}).filter(x=>x.score).sort((a,b)=>b.score-a.score);
}
function extractSlots(profile,key,previous={}){
 previous=previous&&typeof previous==='object'?previous:{};
 const s={},choose=(values,field)=>{if(values.includes(previous[field]))s[field]=previous[field];const found=values.find(v=>has(key,[v]));if(found)s[field]=found;};
 choose(cities,'city');
 if(profile==='khaled_design'){
  if(/^\d{1,5}$/.test(String(previous.area||''))&&Number(previous.area)>0&&Number(previous.area)<=10000)s.area=String(previous.area);
  const a=key.match(/(\d{1,5})\s*(?:متر|م(?=\s|$))/);if(a&&Number(a[1])>0&&Number(a[1])<=10000)s.area=a[1];
  choose(['شقة','فيلا','محل','مكتب','دوبلكس'],'property');choose(['على الطوب','نص تشطيب','نصف تشطيب','تجديد','على المحارة'],'condition');choose(['مودرن','كلاسيك','نيوكلاسيك'],'style');
 }else{
  choose(['مورد','مصنع','محل','شركة','موزع'],'business');choose(materials,'material');
  if(/^\d{1,5}$/.test(String(previous.productCount||''))&&Number(previous.productCount)>0)s.productCount=String(previous.productCount);
  const count=key.match(/(\d{1,5})\s*(?:منتج|صنف)/);if(count&&Number(count[1])>0)s.productCount=count[1];
  if(/^\d{1,6}\s(?:متر|طن|قطعة|شيكارة|كيلو)$/.test(String(previous.quantity||'')))s.quantity=previous.quantity;
  const q=key.match(/(\d{1,6})\s*(متر|طن|قطعه|شيكاره|كيلو)/);if(q&&Number(q[1])>0)s.quantity=q[1]+' '+q[2].replace(/ه$/,'ة');
 }
 return s;
}
function slotSummary(s){return [s.area?s.area+' متر':null,s.property,s.city,s.condition,s.style,s.business,s.material,s.quantity,s.productCount?s.productCount+' صنف':null].filter(Boolean).join('، ');}
function nextQuestion(profile,s,topic){
 if(profile==='khaled_design'&&topic==='facade')return (!s.city?'في أنهي محافظة؟ ':'')+'محتاجين عدد الواجهات ومقاساتها وصور المبنى، والمطلوب تصميم ولا إشراف؟';
 if(profile==='khaled_design')return [!s.area&&topic!=='facade'?'المساحة كام متر؟':null,!s.city?'في أنهي محافظة؟':null,!s.property?'نوع المكان إيه؟':null].filter(Boolean).slice(0,2).join(' ')||'محتاج أي مخرجات بالضبط، وعندك مخطط أو صور مرجعية؟ الفريق يأكد السعر والميعاد بعد المراجعة.';
 const listing=['listing','subscriptions','catalog','ads','store'].includes(topic);
 return (listing?[!s.business?'نشاطك مورد ولا مصنع أو محل؟':null,!s.productCount?'هتعرض كام صنف تقريبًا؟':null]:[!s.material?'الخامة أو الصنف المطلوب إيه؟':null,!s.quantity?'الكمية ووحدة البيع إيه؟':null,!s.city?'التوريد لأنهي محافظة؟':null]).filter(Boolean).slice(0,2).join(' ')||'قولّي المواصفة والموعد المطلوب، والتكلفة أو التوفر يتأكدوا من صاحب الصلاحية قبل الاتفاق.';
}
function answerTrade({profile,message,context={},now=Date.now()}){
 const p=profiles[profile];if(!p)throw Error('unsupported trade profile');
 context=context&&typeof context==='object'?context:{};
 const key=normalize(message),match=phrases=>has(key,phrases),byId=new Map(p.intents.map(i=>[i.id,i]));
 const fresh=context.profile===profile&&Number.isFinite(context.at)&&context.at<=now&&now-context.at<24*3600000&&byId.has(context.intentId)&&!match(['مشروع جديد','طلب جديد']);
 const previous=fresh?byId.get(context.intentId):null,slots=extractSlots(profile,key,fresh?context.slots:{}),matches=rankTrade(profile,message);
 let selected=matches[0]?.intent,base=selected||previous||byId.get('overview'),topic=base.topic,intentId=base.id,reply;
 if(match(['مش عايز','مش مهتم','مش محتاج'])&&!match(['غير','بس']))reply='تمام، مش هنعتبر ده طلب خدمة أو حجز. تحب توضح الأنسب ليك أو نوقف الكلام هنا؟';
 else if(!selected&&match(['وضح اكتر','فيدني اكتر','اشرح اكتر','تفاصيل','مش فاهم','فهمني','يعني ايه','كمل']))reply=previous?previous.detail:p.intents.find(i=>i.id==='overview').reply;
 else if(!selected&&match(['اعملها ليه','فايدتها ايه','هستفيد ايه','هتفيدني ازاي']))reply=byId.get(profile==='khaled_design'?'design_benefit':'benefit').reply;
 else if(selected){
  reply=selected.reply;
  if(previous&&!['facade_price','supervision_price'].includes(selected.id)&&['price','deadline','delivery','discount','payments','payment','included','annual','facade_price','supervision_price'].includes(selected.id)&&!['general','pricing','support'].includes(previous.topic)){
   topic=previous.topic;intentId=previous.id;
   if(['price','facade_price','supervision_price'].includes(selected.id)&&slotSummary(slots))reply='تمام، عندي: '+slotSummary(slots)+'. '+nextQuestion(profile,slots,topic)+' السعر النهائي يحتاج اعتمادًا، ومفيش سعر تلقائي من عرض قديم.';
  }
  const labels={interior:'التصميم الداخلي',facade:'تصميم الواجهة',execution:'طلب التشطيبات',commercial:'تصميم المكان التجاري',style:'ستايل التصميم',listing:'عرض نشاطك في الدليل',subscriptions:'اشتراك الموردين',materials:'طلب الخامات'};
  const collect=profile==='khaled_design'?['interior','facade','execution','apartment','villa','commercial','renovation','style']:['join','packages','ceramics','cement','wood','plumbing','electrical','quantity','price'];
  if(collect.includes(selected.id)&&slotSummary(slots))reply='بخصوص '+(labels[topic]||'طلبك')+': عندي '+slotSummary(slots)+'. '+nextQuestion(profile,slots,topic);
  if(profile==='eldalel_suppliers'&&selected.id==='price'&&previous&&['listing','subscriptions','catalog','ads','store'].includes(previous.topic))reply='بخصوص اشتراك الموردين: نراجع سعر الباقة ومزاياها ومدتها من عرض معتمد وساري، ومش هنستخدم سعر توريد خامة أو باقة صنايعي بدلها. '+nextQuestion(profile,slots,previous.topic);
  if(previous&&['handover_state','style'].includes(selected.id)&&slotSummary(slots)){topic=previous.topic;intentId=previous.id;reply='تمام، عندي: '+slotSummary(slots)+'. '+nextQuestion(profile,slots,topic);}
  const compound=has(key,['بكام','السعر','التكلفة'])||/(?:^|\s)و(?:بيخلص|هستلم|الشحن|امتي)/u.test(key);
  const second=matches.find(x=>!(profile==='eldalel_suppliers'&&x.intent.id==='price'&&['listing','subscriptions','catalog','ads','store'].includes(topic))&&x.intent.id!==selected.id&&['price','deadline','delivery','shipping','payments','included'].includes(x.intent.id))?.intent;
  if(compound&&second&&reply.length+second.reply.length<950)reply+='\n\n'+second.reply;
 }else if(slotSummary(slots))reply='تمام، عندي التفاصيل دي: '+slotSummary(slots)+'. '+nextQuestion(profile,slots,topic);
 else if(match(['اه','ايوه','تمام','ماشي','موافق']))reply='تمام، نكمل التفاصيل الأول: '+nextQuestion(profile,slots,topic)+' المحادثة دي مش تأكيد حجز أو دفع أو بدء تنفيذ.';
 else reply='محتاج أوضح قصدك علشان أجاوبك صح. '+(profile==='khaled_design'?'بتسأل عن تصميم داخلي أو واجهة، إشراف، ولا طلب تشطيبات؟':'عايز تعرض نشاطك في الدليل، تسأل عن اشتراك، ولا بتدور على خامة ومورد؟');
 return {reply,mode:'saved_reply',requiresReview:false,topic,intentId,conversation:{profile,topic,intentId,slots,at:now}};
}
function shouldUseSupplier(message,context){
 const key=normalize(message);
 if(has(key,['صور','صورة','وريني']))return false;
 if(has(key,['تصميم داخلي','تشطيب شقة','عايز موقع','موقع الكتروني','متجر الكتروني','عايز متجر','سمارت ديجيتال']))return false;
 if(has(key,['مورد','موردين','مصنع','خامات','توريد','كتالوج','منتجات','باقات الشركات','باقة الشركات',...materials]))return true;
 return context?.profile==='eldalel_suppliers'&&Number.isFinite(context.at)&&context.at<=Date.now()&&Date.now()-context.at<24*3600000;
}
module.exports={answerTrade,rankTrade,profiles,shouldUseSupplier,extractSlots};

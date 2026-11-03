import {initTeamPerformance} from './team-performance.js';
let replyPreviewContext,replyPreviewGeneration=0;
function resetReplyPreview(){replyPreviewContext=undefined;replyPreviewGeneration++;}
import {eldalelPreset} from './eldalel-preset.js';
import {initializeApp} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js';
import {getAuth,signInWithEmailAndPassword,onAuthStateChanged,signOut,sendPasswordResetEmail} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js';
import {firebaseConfig} from './firebase-config.js';
let localHumanSession=null,localHumanBusy=false;
let localSyncGeneration=0,localBinding=Promise.resolve(),localIncoming=Promise.resolve(),localAutoReply=false;
const app=initializeApp(firebaseConfig),auth=getAuth(app);
const el=id=>document.getElementById(id),status=(s,error=false)=>{el('status').textContent=s;el('status').className=error?'error':''};
const show=(id,on)=>{el(id).classList.toggle('hidden',!on);if(id==='adminPanel')el('adminNav').classList.toggle('hidden',!on);};
async function api(url,body){const u=auth.currentUser;if(!u)throw Error('سجّل الدخول الأول');const token=await u.getIdToken();const r=await fetch(url,{method:body?"POST":"GET",headers:{Authorization:`Bearer ${token}`,...(body?{"Content-Type":"application/json"}:{})},...(body?{body:JSON.stringify(body)}:{})});const j=await r.json();if(!r.ok)throw Error(j.error||'حدث خطأ');return j}
function metric(name,value){const box=document.createElement('div');box.className='metric';const title=document.createElement('div');title.className='muted';title.textContent=name;const val=document.createElement('strong');const labels={starter:'البداية',business:'الأعمال',pro:'الاحترافية',trial:'تجريبي',suspended:'موقوف',active:'نشط',owner:'مالك الشركة'};val.textContent=labels[value]||String(value);box.append(title,val);return box}
el('signin').addEventListener('click',async()=>{try{status('جاري التحقق...');await signInWithEmailAndPassword(auth,el('email').value,el('password').value);el('password').value='';status('تم تسجيل الدخول')}catch(e){status('تعذر تسجيل الدخول. راجع الحساب وكلمة المرور.',true)}});
el('logout').addEventListener('click',()=>signOut(auth));
onAuthStateChanged(auth,async u=>{
 resetReplyPreview();
 stopLocalSync();
 document.body.classList.toggle('signed-in',!!u);show('sidebar',!!u);show('companyBar',!!u);navigate('overview');
 show('login',!u);show('dashboard',!!u);show('logout',!!u);show('adminPanel',false);
 for(const id of ['metrics','conversations','orders','members','drafts','whatsappInbox','reviewTasks','orderLeads','adminCompanies','billingInfo','invoices','checkoutLink'])el(id).replaceChildren();
 el('tenantId').replaceChildren(new Option('اختر شركتك',''));
 if(!u){status('');return;}
 try{const data=await api('/api/me/companies');if(auth.currentUser?.uid!==u.uid)return;show('adminPanel',data.superAdmin);for(const c of data.companies)el('tenantId').append(new Option(c.name+' — '+c.role,c.id));if(data.companies.length===1){el('tenantId').value=data.companies[0].id;el('load').click();}window.dispatchEvent(new Event('bright:companies-ready'));if(data.superAdmin)await listCompanies();}catch(e){status('تعذر تحميل الشركات: '+e.message,true);}
});
el('tenantId').addEventListener('change',()=>{resetReplyPreview();stopLocalSync();el('savedReplyResult').textContent='';for(const id of ['metrics','conversations','orders','members','drafts','whatsappInbox','reviewTasks','orderLeads','billingInfo','invoices','checkoutLink'])el(id).replaceChildren();for(const key of ['businessDescription','services','guidelines','greeting','savedReplies'])el(key).value='';renderReplyRows();el('load').click();});
el('load').addEventListener('click',async()=>{const id=el('tenantId').value.trim();if(!/^[a-zA-Z0-9_-]{6,100}$/.test(id)){status('معرّف الشركة غير صالح',true);return}el('load').disabled=true;try{const q=encodeURIComponent(id);const [company,history]=await Promise.all([api(`/api/company?tenantId=${q}`),api(`/api/company/conversations?tenantId=${q}`)]);const m=el('metrics');m.replaceChildren(metric('الشركة',company.tenant.name),metric('الباقة',company.tenant.plan),metric('حالة الاشتراك',company.tenant.subscriptionStatus),metric('الاستخدام هذا الشهر',history.usage.reserved));const c=el('conversations');c.replaceChildren();for(const record of history.conversations){const div=document.createElement('div');div.className='conversation';const question=document.createElement('p'),answer=document.createElement('p');question.textContent='العميل: '+record.message;answer.textContent='Bright Ai: '+record.reply;div.append(question,answer);c.append(div)}if(!history.conversations.length)c.textContent='لا توجد محادثات حاليًا';const a=await api(`/api/company/agent?tenantId=${q}`);el('assistantProfile').value=a.settings.assistantProfile||'generic';for(const key of ['businessDescription','services','guidelines','greeting','savedReplies'])el(key).value=a.settings[key]||'';renderReplyRows();try{const a=await api(`/api/company/automation?tenantId=${q}`);el('automationMode').value=a.settings.mode}catch{}status('تم تحميل البيانات')}catch(e){el('metrics').replaceChildren();el('conversations').replaceChildren();status('تعذر عرض الشركة أو لا تملك صلاحية الوصول.',true)}finally{el('load').disabled=false}});

el('saveAgent').addEventListener('click',async()=>{try{const tenantId=el('tenantId').value.trim(),body={tenantId,assistantProfile:el('assistantProfile').value};for(const k of ['businessDescription','services','guidelines','greeting','savedReplies'])body[k]=el(k).value;await api('/api/company/agent',body);resetReplyPreview();status('تم حفظ الإعدادات')}catch(e){status('تعذّر الحفظ: '+e.message,true)}});
el('createCompany').addEventListener('click',async()=>{try{const result=await api('/api/admin/companies',{name:el('newName').value,ownerUid:el('ownerUid').value,plan:el('newPlan').value});status('تم إنشاء الشركة معلّقة. معرّف الشركة: '+result.tenantId);await listCompanies()}catch(e){status('تعذّر إنشاء الشركة: '+e.message,true)}});
async function listCompanies(){const data=await api('/api/admin/companies');const host=el('adminCompanies');host.replaceChildren();for(const c of data.companies){const p=document.createElement('p');p.textContent=`${c.name} — ${c.plan} — ${c.subscriptionStatus} — ${c.id}`;host.append(p)}}

el('loadOrders').addEventListener('click',async()=>{try{const tenantId=el('tenantId').value.trim();const r=await api('/api/company/orders?tenantId='+encodeURIComponent(tenantId));el('orders').replaceChildren();for(const o of r.orders){const row=document.createElement('p');row.textContent=`${o.id}: ${o.customerName||'عميل'} — ${o.details||'طلب'} — ${o.status}`;const sel=document.createElement('select');for(const v of ['new','in_progress','completed','cancelled']){const option=document.createElement('option');option.value=v;option.textContent=v;option.selected=v===o.status;sel.append(option)}sel.addEventListener('change',async()=>{try{await api('/api/company/order-status',{tenantId,orderId:o.id,status:sel.value});status('تم تحديث الطلب')}catch{status('تعذر تحديث الطلب',true)}});row.append(sel);el('orders').append(row)}if(!r.orders.length)el('orders').textContent='لا توجد طلبات'}catch{status('تعذر تحميل الطلبات',true)}});
el('saveSubscription').addEventListener('click',async()=>{try{await api('/api/admin/subscription',{tenantId:el('subTenantId').value.trim(),plan:el('subPlan').value,status:el('subStatus').value,renewalDate:el('subRenewal').value});status('تم تحديث الاشتراك')}catch(e){status('تعذر تحديث الاشتراك: '+e.message,true)}});

el('createOrder').addEventListener('click',async()=>{
  try{
    const tenantId=el('tenantId').value.trim();
    const r=await api('/api/company/orders',{tenantId,customerName:el('orderCustomer').value,contact:el('orderContact').value,details:el('orderDetails').value});
    status('تم تسجيل الطلب: '+r.orderId);
    for(const k of ['orderCustomer','orderContact','orderDetails'])el(k).value='';
    el('loadOrders').click();
  }catch(e){status('تعذر تسجيل الطلب: '+e.message,true)}
});
function replyButton(tenantId,messageId,reply){
  const btn=document.createElement('button');btn.textContent='مراجعة وإرسال الرد';
  btn.addEventListener('click',async()=>{
    const edited=window.prompt('راجع نص الرد بعناية قبل إرساله على واتساب:',reply);
    if(edited===null)return;
    if(!edited.trim()){status('نص الرد فارغ',true);return}
    if(!window.confirm('هل تريد إرسال هذا الرد فعليًا للعميل عبر واتساب؟'))return;
    btn.disabled=true;
    try{await api('/api/company/whatsapp/reply',{tenantId,messageId,reply:edited.trim()});status('تم طلب الإرسال من خادم واتساب');}
    catch(e){status('فشل الإرسال: '+e.message,true)}finally{btn.disabled=false}
  });return btn;
}
el('loadWhatsapp').addEventListener('click',async()=>{
  try{
    const tenantId=el('tenantId').value.trim();
    const r=await api('/api/company/whatsapp-inbox?tenantId='+encodeURIComponent(tenantId));
    const host=el('whatsappInbox');host.replaceChildren();
    for(const m of r.messages){
      const item=document.createElement('div');item.className='conversation';
      const label=document.createElement('p');label.textContent=`${m.from}: ${m.text} (${m.status})`;
      const input=document.createElement('input');input.placeholder='رد يدوي للعميل';input.maxLength=2000;
      const manual=document.createElement('button');manual.textContent='إرسال رد يدوي';
      manual.addEventListener('click',async()=>{
        if(!input.value.trim())return;if(!window.confirm('تأكيد إرسال هذا النص فعليًا للعميل؟'))return;manual.disabled=true;
        try{const result=await api(m.source==='local_qr'?'/api/company/whatsapp/qr-human-reply':'/api/company/whatsapp/reply',{tenantId,messageId:m.id,reply:input.value.trim()});status(m.source==='local_qr'?'تم وضع الرد في انتظار جلسة Windows المتصلة؛ لا يُحسب ردًا ناجحًا حتى قبول واتساب.':'تم طلب الإرسال');input.value=''}
        catch(e){status('تعذر الإرسال: '+e.message,true)}finally{manual.disabled=false}
      });
      const draft=document.createElement('button');draft.textContent='اقتراح رد محفوظ';
      draft.addEventListener('click',async()=>{
        draft.disabled=true;
        try{const result=await api('/api/company/whatsapp/draft',{tenantId,messageId:m.id});status('تم إنشاء مسودة. راجعها قبل الإرسال.');item.append(replyButton(tenantId,m.id,result.reply))}
        catch(e){status('تعذر إنشاء المسودة: '+e.message,true)}finally{draft.disabled=false}
      });
      if(m.source==='local_qr'){const note=document.createElement('p');note.textContent=m.status==='replied'?'تم إرسال الرد التلقائي عبر جلسة واتساب المحلية.':m.status==='reply_unknown'?'نتيجة الإرسال غير مؤكدة؛ لن يُعاد تلقائيًا لتجنب التكرار.':'مزامنة QR — تابع حالة الرد في المسودات.';item.append(label,note,input,manual);}else item.append(label,input,manual,draft);host.append(item);
    }
    if(!r.messages.length)host.textContent='لا توجد رسائل واردة';
  }catch(e){status('تعذر عرض رسائل واتساب: '+e.message,true)}
});
el('loadDrafts').addEventListener('click',async()=>{
  try{
    const tenantId=el('tenantId').value.trim();
    const result=await api('/api/company/whatsapp/drafts?tenantId='+encodeURIComponent(tenantId));
    const host=el('drafts');host.replaceChildren();
    for(const d of result.drafts){
      const card=document.createElement('div');card.className='conversation';
      const body=document.createElement('p');body.textContent=d.reply;
      const state=document.createElement('small');state.textContent='حالة المسودة: '+d.status;
      card.append(body,state);if(d.source==='local_qr'){const note=document.createElement('p');note.textContent=d.status==='sent'?'تم إرسال الرد عبر واتساب.':d.status==='reply_unknown'?'نتيجة الإرسال غير مؤكدة؛ راجع واتساب قبل أي محاولة أخرى.':'رد محفوظ من المزامنة المحلية.';card.append(note);}else card.append(replyButton(tenantId,d.sourceMessageId,d.reply));host.append(card);
    }
    if(!result.drafts.length)host.textContent='لا توجد مسودات محفوظة';
  }catch(e){status('تعذر تحميل المسودات: '+e.message,true)}
});

// V17: pending orders review, generated as textContent only (never HTML from customers).
el('loadLeads').addEventListener('click',async()=>{
  const tenantId=el('tenantId').value.trim(),host=el('orderLeads');
  host.replaceChildren();el('loadLeads').disabled=true;
  try{
    const result=await api('/api/company/order-leads?tenantId='+encodeURIComponent(tenantId));
    for(const lead of result.leads){
      const card=document.createElement('div');card.className='conversation';
      const heading=document.createElement('strong');heading.textContent='رسالة: '+lead.id+' — '+lead.status;
      const name=document.createElement('input');name.value=lead.customerName||'';name.maxLength=120;name.placeholder='اسم العميل';name.setAttribute('aria-label','اسم العميل');
      const details=document.createElement('input');details.value=lead.details||'';details.maxLength=2000;details.placeholder='تفاصيل الطلب';details.setAttribute('aria-label','تفاصيل الطلب');
      const contact=document.createElement('p');contact.textContent='التواصل: '+(lead.contact||'غير متاح');
      card.append(heading,contact,name,details);
      if(lead.status==='pending_review'){
        const approve=document.createElement('button');approve.textContent='مراجعة واعتماد الطلب';
        approve.addEventListener('click',async()=>{
          if(!confirm('تأكيد اعتماد الطلب بعد مراجعة معلومات العميل؟'))return;
          approve.disabled=true;
          try{
            const r=await api('/api/company/approve-order-lead',{tenantId,leadId:lead.id,customerName:name.value,details:details.value});
            status(r.created?'تم إنشاء الطلب بنجاح':'الطلب معتمد بالفعل');
            el('loadLeads').click();
          }catch(e){status('تعذر اعتماد الطلب: '+e.message,true);approve.disabled=false;}
        });card.append(approve);
      }
      host.append(card);
    }
    if(!result.leads.length)host.textContent='لا توجد طلبات محتملة حاليًا';
  }catch(e){status('تعذر تحميل الطلبات المحتملة: '+e.message,true)}
  finally{el('loadLeads').disabled=false}
});

// V19: safe billing preview + automation settings. No automatic WhatsApp sending.
el('billingPreview').addEventListener('click',async()=>{
 try{const tenantId=el('tenantId').value.trim();const x=await api('/api/company/billing-preview?tenantId='+encodeURIComponent(tenantId));
 el('billingInfo').replaceChildren(metric('الباقة',x.checkout.plan),metric('الجنيه المصري / شهر',x.checkout.priceEGP),metric('الحالة',x.subscriptionStatus),metric('تاريخ التجديد',x.renewalDate||'غير محدد'));
 status('دي معاينة، الدفع الإلكتروني غير متصل.');}catch(e){status('تعذّر عرض تفاصيل الاشتراك: '+e.message,true)}
});
el('saveAutomation').addEventListener('click',async()=>{
 try{const x=await api('/api/company/automation',{tenantId:el('tenantId').value.trim(),mode:el('automationMode').value});
 status('تم حفظ الوضع: '+x.settings.mode+' — الإرسال التلقائي غير مفعل');}catch(e){status('تعذر حفظ الإعدادات: '+e.message,true)}
});
el('automationPreview').addEventListener('click',async()=>{
 try{const x=await api('/api/company/automation/preview',{tenantId:el('tenantId').value.trim(),withinWindow:true,remainingReplies:1,customerOptOut:false});
 el('automationResult').textContent='قرار المحاكاة: '+x.decision.action+' ('+x.decision.reason+') — لم يتم إرسال رسائل';}
 catch(e){status('تعذر الاختبار: '+e.message,true)}
});

// V22: review-only workflow, no automatic message sending.
el('loadReviewTasks').addEventListener('click',async()=>{
 const tenantId=el('tenantId').value.trim(),host=el('reviewTasks');host.replaceChildren();
 try{const result=await api('/api/company/review-tasks?tenantId='+encodeURIComponent(tenantId));
  for(const task of result.tasks){
   const row=document.createElement('div');row.className='conversation';
   const label=document.createElement('span');label.textContent=task.id+' — '+task.status;row.append(label);
   if(task.status==='pending_preflight'){
    const btn=document.createElement('button');btn.textContent='إنشاء مسودة للمراجعة';
    btn.addEventListener('click',async()=>{btn.disabled=true;try{
      await api('/api/company/review-tasks/generate',{tenantId,taskId:task.id});
      status('المسودة جاهزة للمراجعة، ولم تُرسل للعميل');el('loadReviewTasks').click();el('loadDrafts').click();
     }catch(e){status('تعذر إنشاء المسودة: '+e.message,true)}finally{btn.disabled=false}});row.append(btn);
   }host.append(row);
  }if(!result.tasks.length)host.textContent='لا توجد مهام مراجعة';
 }catch(e){status('تعذر تحميل المهام: '+e.message,true)}
});

el('resetPassword').addEventListener('click',async()=>{try{await sendPasswordResetEmail(auth,el('email').value.trim());status('لو البريد مسجل، ستصلك تعليمات استعادة كلمة المرور.');}catch{status('تعذر الطلب. تحقق من البريد ثم حاول لاحقًا.',true);}});
el('refreshCompanies').addEventListener('click',()=>listCompanies().catch(e=>status(e.message,true)));
el('loadMembers').addEventListener('click',async()=>{try{const data=await api('/api/company/members?tenantId='+encodeURIComponent(el('tenantId').value));el('members').replaceChildren();for(const m of data.members){const row=document.createElement('p');row.textContent=m.uid+' — '+m.role+' — '+(m.active?'نشط':'موقوف');el('members').append(row);}}catch(e){status(e.message,true);}});
el('saveMember').addEventListener('click',async()=>{try{await api('/api/company/members',{tenantId:el('tenantId').value,uid:el('memberUid').value.trim(),role:el('memberRole').value,active:el('memberActive').value==='true',name:el('memberName').value,jobTitle:el('memberJobTitle').value});status('تم حفظ صلاحية الموظف');el('loadMembers').click();}catch(e){status(e.message,true);}});
el('saveChannel').addEventListener('click',async()=>{try{await api('/api/admin/whatsapp-channel',{tenantId:el('channelTenantId').value.trim(),phoneNumberId:el('channelNumberId').value.trim()});status('تم حفظ ربط الرقم. الإرسال يحتاج تفعيلًا منفصلًا.');}catch(e){status(e.message,true);}});
el('loadInvoices').addEventListener('click',async()=>{try{const data=await api('/api/company/invoices?tenantId='+encodeURIComponent(el('tenantId').value));el('invoices').replaceChildren();for(const i of data.invoices){const row=document.createElement('p');row.textContent=i.id+' — '+i.amountMinor/100+' ج — '+i.status;el('invoices').append(row);}if(!data.invoices.length)el('invoices').textContent='لا توجد فواتير تجريبية';}catch(e){status(e.message,true);}});
let checkoutRequestId;
el('sandboxCheckout').addEventListener('click',async()=>{
 if(!confirm('إنشاء رابط دفع تجريبي فقط؟ لا تدخل بيانات بطاقة حقيقية.'))return;
 const btn=el('sandboxCheckout');btn.disabled=true;
 try{checkoutRequestId||=crypto.randomUUID();const data=await api('/api/company/checkout',{tenantId:el('tenantId').value,requestId:checkoutRequestId,billing:{first_name:el('billFirst').value,last_name:el('billLast').value,email:el('billEmail').value,phone_number:el('billPhone').value}});const link=document.createElement('a');link.textContent='افتح صفحة الاختبار في متصفحك: '+data.checkoutUrl;link.href=data.checkoutUrl;link.target='_blank';link.rel='noopener noreferrer';el('checkoutLink').replaceChildren(link);status('رابط تجريبي. داخل تطبيق Windows انسخ الرابط وافتحه في المتصفح.');}catch(e){status(e.message+' — راجع الفواتير قبل إعادة المحاولة.',true);}finally{btn.disabled=false;}
});

el('previewSavedReply').addEventListener('click',async()=>{const btn=el('previewSavedReply'),tenantId=el('tenantId').value,uid=auth.currentUser?.uid,generation=replyPreviewGeneration;btn.disabled=true;el('savedReplyResult').textContent='';try{const r=await api('/api/company/replies/preview',{tenantId,text:el('replyTestText').value,context:replyPreviewContext});if(generation!==replyPreviewGeneration||tenantId!==el('tenantId').value||uid!==auth.currentUser?.uid)return;replyPreviewContext=r.conversation;el('savedReplyImage').classList.toggle('hidden',!r.media);if(r.media?.mimeType==='image/jpeg')el('savedReplyImage').src='data:image/jpeg;base64,'+r.media.data;else el('savedReplyImage').removeAttribute('src');el('savedReplyResult').textContent=(r.requiresReview?'تحتاج مراجعة: ':'رد محفوظ: ')+r.reply+' — لم يتم إرسال رسائل';}catch(e){status(e.message,true)}finally{btn.disabled=false}});

function navigate(page){if(page==='admin'&&el('adminPanel').classList.contains('hidden'))return;document.querySelectorAll('[data-page]').forEach(v=>v.classList.toggle('active-view',v.dataset.page===page));document.querySelectorAll('.nav-item').forEach(b=>{const active=b.dataset.go===page;b.classList.toggle('active',active);b.setAttribute('aria-current',active?'page':'false');});const titles={overview:'نظرة عامة',replies:'الموظف والردود',orders:'الطلبات',inbox:'المحادثات',team:'فريق العمل',performance:'أداء الموظفين والمبيعات',billing:'الاشتراك',admin:'إدارة المنصة'};el('pageTitle').textContent=titles[page]||titles.overview;window.scrollTo({top:0,behavior:'instant'});}
document.querySelectorAll('[data-go]').forEach(b=>b.addEventListener('click',()=>navigate(b.dataset.go)));

function syncReplyRows(){el('savedReplies').value=Array.from(el('replyRows').children).map(row=>{const q=row.querySelector('input').value.trim(),a=row.querySelector('textarea').value.trim();return q||a?q+' | '+a:''}).filter(Boolean).join('\n');}
function addReplyRow(question='',answer=''){
 if(el('replyRows').children.length>=200){status('الحد الأقصى 200 رد',true);return;}
 const row=document.createElement('div');row.className='reply-row';const number=document.createElement('span');number.className='row-number';number.textContent='رد محفوظ';
 const qLabel=document.createElement('label');qLabel.textContent='عبارة العميل';const q=document.createElement('input');q.maxLength=120;q.placeholder='مثال: مواعيد العمل';q.value=question;qLabel.append(q);
 const aLabel=document.createElement('label');aLabel.textContent='الإجابة المعتمدة';const a=document.createElement('textarea');a.maxLength=1000;a.rows=2;a.placeholder='اكتب الإجابة الخاصة بشركتك';a.value=answer;aLabel.append(a);
 const remove=document.createElement('button');remove.type='button';remove.className='delete-reply';remove.textContent='حذف';remove.addEventListener('click',()=>{row.remove();syncReplyRows();});
 for(const field of [q,a])field.addEventListener('input',()=>{field.value=field.value.replace(/[\r\n]+/g,' ');if(field===q)field.value=field.value.replace(/\|/g,' ');syncReplyRows();});
 row.append(number,remove,qLabel,aLabel);el('replyRows').append(row);
}
function renderReplyRows(){el('replyRows').replaceChildren();for(const line of el('savedReplies').value.split(/\r?\n/).filter(x=>x.trim())){const at=line.indexOf('|');addReplyRow(line.slice(0,at).trim(),line.slice(at+1).trim());}if(!el('replyRows').children.length)addReplyRow();}
el('addSavedReply').addEventListener('click',()=>addReplyRow());
document.querySelectorAll('[data-inbox-go]').forEach(btn=>btn.addEventListener('click',()=>{document.querySelectorAll('[data-inbox]').forEach(p=>p.classList.toggle('inbox-active',p.dataset.inbox===btn.dataset.inboxGo));document.querySelectorAll('[data-inbox-go]').forEach(b=>b.setAttribute('aria-selected',String(b===btn)));}));

function localStatus(text,qr=null){el('localWaState').textContent=text;el('localWaQr').classList.toggle('hidden',!qr);if(qr&&/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(qr))el('localWaQr').src=qr;else el('localWaQr').removeAttribute('src');}
function stopLocalSync(){localHumanSession=null;if(window.brightWhatsApp?.closeWeb)window.brightWhatsApp.closeWeb().catch(()=>{});localAutoReply=false;localSyncGeneration++;localBinding=Promise.resolve();localIncoming=Promise.resolve();el('localWaLog').textContent='';localStatus('غير متصل');if(window.brightWhatsApp)window.brightWhatsApp.stop().catch(()=>{});}
el('stopLocalWa').addEventListener('click',()=>stopLocalSync());
el('startLocalWa').addEventListener('click',async()=>{
 if(!window.brightWhatsApp){localStatus('المزامنة تحتاج نسخة Windows المحدثة؛ فتح واتساب في المتصفح وحده لا يزامن الرسائل.');return;}
 if(el('assistantProfile').value==='eldalel'&&window.brightWhatsApp.version<3){localStatus('مساعد الدليل وإرسال الصور يحتاجان نسخة Windows 26.3.0 أو أحدث.');return;}
 if(el('localWaAutoReply').checked&&typeof window.brightWhatsApp.reply!=='function'){localStatus('الرد التلقائي يحتاج نسخة Windows 26.2.0 أو أحدث. ثبّت التحديث أولًا.');return;}
 const tenantId=el('tenantId').value,uid=auth.currentUser?.uid;if(!tenantId||!uid){localStatus('اختر شركتك وسجل الدخول أولًا');return;}
 const btn=el('startLocalWa');btn.disabled=true;
 try{await api('/api/company/members?tenantId='+encodeURIComponent(tenantId));stopLocalSync();localAutoReply=el('localWaAutoReply').checked;localStatus('جاري تجهيز اتصال واتساب…');await window.brightWhatsApp.start({tenantId,uid,autoReplyEnabled:localAutoReply});}
 catch(e){localStatus('تعذر بدء المزامنة: '+e.message);}finally{btn.disabled=false;}
});
if(window.brightWhatsApp){
 const matches=data=>data.uid===auth.currentUser?.uid&&data.tenantId===el('tenantId').value;
 window.brightWhatsApp.onStatus(data=>{
  if(!matches(data))return;
  if(data.state==='qr')localStatus('امسح الكود من موبايلك: الأجهزة المرتبطة ← ربط جهاز',data.qr);
  else if(data.state==='connected'){localHumanSession={tenantId:data.tenantId,uid:data.uid,sessionId:data.sessionId};
   const generation=localSyncGeneration;localStatus('تم اتصال واتساب. جاري ربطه بالشركة…');
   localBinding=api('/api/company/local-whatsapp/bind',{tenantId:data.tenantId,account:data.account,sessionId:data.sessionId,autoReplyEnabled:localAutoReply}).then(result=>{if(generation===localSyncGeneration)localStatus(result.autoReplyEnabled?'متصل — الرد التلقائي مفعل لأي رقم يرسل رسالة نصية خاصة جديدة.':'متصل — مزامنة ومسودات فقط. الرد التلقائي متوقف.');}).catch(e=>{if(generation===localSyncGeneration){localStatus('تعذر ربط الشركة: '+e.message);window.brightWhatsApp.stop().catch(()=>{});}throw e;});localBinding.catch(()=>{});
  }else if(data.state==='connecting')localStatus('جاري الاتصال بواتساب…');
  else {localHumanSession=null;localStatus(data.error||'انقطع الاتصال. اضغط بدء المزامنة لإعادة الاتصال.');}
 });
 window.brightWhatsApp.onIncoming(data=>{
  if(!matches(data))return;const generation=localSyncGeneration;
  localIncoming=localIncoming.catch(()=>{}).then(async()=>{
   await localBinding;if(generation!==localSyncGeneration||!matches(data))return;
   await api('/api/company/local-whatsapp/inbox',{tenantId:data.tenantId,account:data.account,sessionId:data.sessionId,messageId:data.messageId,from:data.from,text:data.text,timestamp:data.timestamp,...(data.media?{media:data.media}:{})});
   let messageStatus='تمت مزامنة رسالة وتجهيز مسودة.';
   if(localAutoReply&&!data.media){
    const request={tenantId:data.tenantId,account:data.account,sessionId:data.sessionId,sourceMessageId:data.messageId,from:data.from};
    const claim=await api('/api/company/local-whatsapp/reply-claim',request);
    if(generation!==localSyncGeneration||!matches(data))return;
    if(claim.allowed){
     const result=await window.brightWhatsApp.reply({...data,reply:claim.reply,claimId:claim.claimId,media:claim.media});
     if(generation!==localSyncGeneration||!matches(data))return;
     await api('/api/company/local-whatsapp/reply-result',{...request,claimId:claim.claimId,status:result.status,whatsappMessageId:result.whatsappMessageId});
     messageStatus=result.status==='sent'?'تم إرسال الرد التلقائي عبر واتساب.':'نتيجة الإرسال غير مؤكدة؛ لن نكرر المحاولة تلقائيًا.';
    }else messageStatus=claim.status==='sent'?'هذه الرسالة تم الرد عليها سابقًا.':claim.status==='unknown'?'نتيجة محاولة سابقة غير مؤكدة؛ لم نكرر الإرسال.':claim.status==='opted_out'?'العميل أوقف الرسائل؛ لم نرسل ردًا.':'تمت المزامنة بدون إرسال: '+claim.status;
   }
   if(generation!==localSyncGeneration||!matches(data))return;
   await window.brightWhatsApp.ack(data);
   el('localWaLog').textContent=messageStatus;el('loadWhatsapp').click();
  }).catch(e=>{if(generation===localSyncGeneration)el('localWaLog').textContent='رسالة معلّقة محليًا؛ ستتم إعادة المحاولة: '+e.message;});
 });
}

el('activateEldalel').addEventListener('click',async()=>{const btn=el('activateEldalel');btn.disabled=true;try{const tenantId=el('tenantId').value;if(!tenantId)throw Error('اختر شركتك أولًا');const current=await api('/api/company/agent?tenantId='+encodeURIComponent(tenantId));const saved=await api('/api/company/agent',{tenantId,...current.settings,assistantProfile:'eldalel',savedReplies:eldalelPreset.savedReplies,greeting:eldalelPreset.greeting,businessDescription:'الدليل الشامل: خدمات التشطيبات والموردين والشركات والمواقع والمتاجر الإلكترونية.',services:'طلبات التشطيبات، عرض الخدمات والشركات، كتالوج مواد التشطيب والموردون، إنشاء المواقع والمتاجر الإلكترونية.'});el('assistantProfile').value='eldalel';resetReplyPreview();for(const key of ['businessDescription','services','guidelines','greeting','savedReplies'])el(key).value=saved.settings[key]||'';renderReplyRows();status('تم تفعيل مساعد الدليل الشامل. جرّب رسالة من هنا، ثم ابدأ مزامنة واتساب من النسخة الجديدة.');}catch(e){status(e.message,true)}finally{btn.disabled=false}});

el('activateSmartDigital').addEventListener('click',async()=>{const btn=el('activateSmartDigital');btn.disabled=true;try{const tenantId=el('tenantId').value;if(!tenantId)throw Error('اختر شركة Smart Digital أولًا');const preset=await api('/api/company/agent-presets/smart-digital?tenantId='+encodeURIComponent(tenantId));const saved=await api('/api/company/agent',{tenantId,...preset.settings});resetReplyPreview();el('assistantProfile').value='smart_digital';for(const key of ['businessDescription','services','guidelines','greeting','savedReplies'])el(key).value=saved.settings[key]||'';renderReplyRows();status('تم تجهيز '+preset.paths+' مسار و'+preset.questionForms+' صيغة سؤال لـSmart Digital في الشركة المختارة. جرّب الحوار بدون إرسال.');}catch(e){status(e.message,true)}finally{btn.disabled=false}});

for(const [id,path,profile,name] of [['activateKhaledDesign','khaled-design','khaled_design','خالد ديزاين'],['activateSuppliers','eldalel-suppliers','eldalel_suppliers','الموردين']])el(id).addEventListener('click',async()=>{const btn=el(id);btn.disabled=true;try{const tenantId=el('tenantId').value;if(!tenantId)throw Error('اختر الشركة أولًا');const preset=await api('/api/company/agent-presets/'+path+'?tenantId='+encodeURIComponent(tenantId));if(el('tenantId').value!==tenantId)throw Error('تغيرت الشركة؛ أعد الاختيار');const saved=await api('/api/company/agent',{tenantId,...preset.settings});if(el('tenantId').value!==tenantId)return;resetReplyPreview();el('assistantProfile').value=profile;for(const key of ['businessDescription','services','guidelines','greeting','savedReplies'])el(key).value=saved.settings[key]||'';renderReplyRows();status('تم تجهيز '+preset.paths+' مسار و'+preset.questionForms+' صيغة سؤال لـ'+name+'. جرّب الحوار بدون إرسال.');}catch(e){status(e.message,true)}finally{btn.disabled=false}});

el('openWhatsAppInterface').addEventListener('click',async()=>{const button=el('openWhatsAppInterface'),out=el('whatsAppInterfaceStatus');button.disabled=true;try{if(!window.brightWhatsApp?.openWeb)throw Error('واجهة المحادثات تحتاج نسخة Windows 26.4.0 أو أحدث. حدّث البرنامج ثم افتحه.');const tenantId=el('tenantId').value,uid=auth.currentUser?.uid;if(!tenantId||!uid)throw Error('سجّل الدخول واختر الشركة أولًا');await api('/api/company/members?tenantId='+encodeURIComponent(tenantId));if(el('tenantId').value!==tenantId||auth.currentUser?.uid!==uid)return;await window.brightWhatsApp.openWeb({tenantId,uid});out.textContent='تم فتح واجهة واتساب داخل Bright Ai. الربط الظاهر فيها مستقل عن المزامنة والرد التلقائي.';}catch(e){out.textContent=e.message;}finally{button.disabled=false}});

initTeamPerformance({api,auth,onAuthStateChanged});

setInterval(async()=>{const c=localHumanSession;if(!c||localHumanBusy||!window.brightWhatsApp?.humanDrain||auth.currentUser?.uid!==c.uid||el('tenantId').value!==c.tenantId)return;localHumanBusy=true;try{await localBinding;const token=await auth.currentUser.getIdToken();if(c!==localHumanSession)return;await window.brightWhatsApp.humanDrain({...c,token});}catch(e){el('localWaLog').textContent='الرد اليدوي ينتظر جلسة صالحة أو يحتاج مراجعة نتيجة الإرسال.';}finally{localHumanBusy=false;}},5000);

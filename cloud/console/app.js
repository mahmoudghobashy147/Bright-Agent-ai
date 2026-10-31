import {initializeApp} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js';
import {getAuth,signInWithEmailAndPassword,onAuthStateChanged,signOut,sendPasswordResetEmail} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js';
import {firebaseConfig} from './firebase-config.js';
const app=initializeApp(firebaseConfig),auth=getAuth(app);
const el=id=>document.getElementById(id),status=(s,error=false)=>{el('status').textContent=s;el('status').className=error?'error':''};
const show=(id,on)=>{el(id).classList.toggle('hidden',!on);if(id==='adminPanel')el('adminNav').classList.toggle('hidden',!on);};
async function api(url,body){const u=auth.currentUser;if(!u)throw Error('سجّل الدخول الأول');const token=await u.getIdToken();const r=await fetch(url,{method:body?"POST":"GET",headers:{Authorization:`Bearer ${token}`,...(body?{"Content-Type":"application/json"}:{})},...(body?{body:JSON.stringify(body)}:{})});const j=await r.json();if(!r.ok)throw Error(j.error||'حدث خطأ');return j}
function metric(name,value){const box=document.createElement('div');box.className='metric';const title=document.createElement('div');title.className='muted';title.textContent=name;const val=document.createElement('strong');val.textContent=String(value);box.append(title,val);return box}
el('signin').addEventListener('click',async()=>{try{status('جاري التحقق...');await signInWithEmailAndPassword(auth,el('email').value,el('password').value);el('password').value='';status('تم تسجيل الدخول')}catch(e){status('تعذر تسجيل الدخول. راجع الحساب وكلمة المرور.',true)}});
el('logout').addEventListener('click',()=>signOut(auth));
onAuthStateChanged(auth,async u=>{
 document.body.classList.toggle('signed-in',!!u);show('sidebar',!!u);navigate('overview');
 show('login',!u);show('dashboard',!!u);show('logout',!!u);show('adminPanel',false);
 for(const id of ['metrics','conversations','orders','members','drafts','whatsappInbox','reviewTasks','orderLeads','adminCompanies','billingInfo','invoices','checkoutLink'])el(id).replaceChildren();
 el('tenantId').replaceChildren(new Option('اختر شركتك',''));
 if(!u){status('');return;}
 try{const data=await api('/api/me/companies');if(auth.currentUser?.uid!==u.uid)return;show('adminPanel',data.superAdmin);for(const c of data.companies)el('tenantId').append(new Option(c.name+' — '+c.role,c.id));if(data.companies.length===1){el('tenantId').value=data.companies[0].id;el('load').click();}if(data.superAdmin)await listCompanies();}catch(e){status('تعذر تحميل الشركات: '+e.message,true);}
});
el('tenantId').addEventListener('change',()=>{el('savedReplyResult').textContent='';for(const id of ['metrics','conversations','orders','members','drafts','whatsappInbox','reviewTasks','orderLeads','billingInfo','invoices','checkoutLink'])el(id).replaceChildren();for(const key of ['businessDescription','services','guidelines','greeting','savedReplies'])el(key).value='';el('load').click();});
el('load').addEventListener('click',async()=>{const id=el('tenantId').value.trim();if(!/^[a-zA-Z0-9_-]{6,100}$/.test(id)){status('معرّف الشركة غير صالح',true);return}el('load').disabled=true;try{const q=encodeURIComponent(id);const [company,history]=await Promise.all([api(`/api/company?tenantId=${q}`),api(`/api/company/conversations?tenantId=${q}`)]);const m=el('metrics');m.replaceChildren(metric('الشركة',company.tenant.name),metric('الباقة',company.tenant.plan),metric('حالة الاشتراك',company.tenant.subscriptionStatus),metric('الاستخدام هذا الشهر',history.usage.reserved));const c=el('conversations');c.replaceChildren();for(const record of history.conversations){const div=document.createElement('div');div.className='conversation';const question=document.createElement('p'),answer=document.createElement('p');question.textContent='العميل: '+record.message;answer.textContent='Bright Ai: '+record.reply;div.append(question,answer);c.append(div)}if(!history.conversations.length)c.textContent='لا توجد محادثات حاليًا';const a=await api(`/api/company/agent?tenantId=${q}`);for(const key of ['businessDescription','services','guidelines','greeting','savedReplies'])el(key).value=a.settings[key]||'';try{const a=await api(`/api/company/automation?tenantId=${q}`);el('automationMode').value=a.settings.mode}catch{}status('تم تحميل البيانات')}catch(e){el('metrics').replaceChildren();el('conversations').replaceChildren();status('تعذر عرض الشركة أو لا تملك صلاحية الوصول.',true)}finally{el('load').disabled=false}});

el('saveAgent').addEventListener('click',async()=>{try{const tenantId=el('tenantId').value.trim(),body={tenantId};for(const k of ['businessDescription','services','guidelines','greeting','savedReplies'])body[k]=el(k).value;await api('/api/company/agent',body);status('تم حفظ الإعدادات')}catch(e){status('تعذّر الحفظ: تحقق من صلاحية صاحب الشركة.',true)}});
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
        try{await api('/api/company/whatsapp/reply',{tenantId,messageId:m.id,reply:input.value.trim()});status('تم طلب الإرسال');input.value=''}
        catch(e){status('تعذر الإرسال: '+e.message,true)}finally{manual.disabled=false}
      });
      const draft=document.createElement('button');draft.textContent='اقتراح رد محفوظ';
      draft.addEventListener('click',async()=>{
        draft.disabled=true;
        try{const result=await api('/api/company/whatsapp/draft',{tenantId,messageId:m.id});status('تم إنشاء مسودة. راجعها قبل الإرسال.');item.append(replyButton(tenantId,m.id,result.reply))}
        catch(e){status('تعذر إنشاء المسودة: '+e.message,true)}finally{draft.disabled=false}
      });
      item.append(label,input,manual,draft);host.append(item);
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
      card.append(body,state,replyButton(tenantId,d.sourceMessageId,d.reply));host.append(card);
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
el('saveMember').addEventListener('click',async()=>{try{await api('/api/company/members',{tenantId:el('tenantId').value,uid:el('memberUid').value.trim(),role:el('memberRole').value,active:el('memberActive').value==='true'});status('تم حفظ صلاحية الموظف');el('loadMembers').click();}catch(e){status(e.message,true);}});
el('saveChannel').addEventListener('click',async()=>{try{await api('/api/admin/whatsapp-channel',{tenantId:el('channelTenantId').value.trim(),phoneNumberId:el('channelNumberId').value.trim()});status('تم حفظ ربط الرقم. الإرسال يحتاج تفعيلًا منفصلًا.');}catch(e){status(e.message,true);}});
el('loadInvoices').addEventListener('click',async()=>{try{const data=await api('/api/company/invoices?tenantId='+encodeURIComponent(el('tenantId').value));el('invoices').replaceChildren();for(const i of data.invoices){const row=document.createElement('p');row.textContent=i.id+' — '+i.amountMinor/100+' ج — '+i.status;el('invoices').append(row);}if(!data.invoices.length)el('invoices').textContent='لا توجد فواتير تجريبية';}catch(e){status(e.message,true);}});
let checkoutRequestId;
el('sandboxCheckout').addEventListener('click',async()=>{
 if(!confirm('إنشاء رابط دفع تجريبي فقط؟ لا تدخل بيانات بطاقة حقيقية.'))return;
 const btn=el('sandboxCheckout');btn.disabled=true;
 try{checkoutRequestId||=crypto.randomUUID();const data=await api('/api/company/checkout',{tenantId:el('tenantId').value,requestId:checkoutRequestId,billing:{first_name:el('billFirst').value,last_name:el('billLast').value,email:el('billEmail').value,phone_number:el('billPhone').value}});const link=document.createElement('a');link.textContent='افتح صفحة الاختبار في متصفحك: '+data.checkoutUrl;link.href=data.checkoutUrl;link.target='_blank';link.rel='noopener noreferrer';el('checkoutLink').replaceChildren(link);status('رابط تجريبي. داخل تطبيق Windows انسخ الرابط وافتحه في المتصفح.');}catch(e){status(e.message+' — راجع الفواتير قبل إعادة المحاولة.',true);}finally{btn.disabled=false;}
});

el('previewSavedReply').addEventListener('click',async()=>{const btn=el('previewSavedReply');btn.disabled=true;el('savedReplyResult').textContent='';try{const r=await api('/api/company/replies/preview',{tenantId:el('tenantId').value,text:el('replyTestText').value});el('savedReplyResult').textContent=(r.requiresReview?'تحتاج مراجعة: ':'رد محفوظ: ')+r.reply+' — لم يتم إرسال رسائل';}catch(e){status(e.message,true)}finally{btn.disabled=false}});

function navigate(page){if(page==='admin'&&el('adminPanel').classList.contains('hidden'))return;document.querySelectorAll('[data-page]').forEach(v=>v.classList.toggle('active-view',v.dataset.page===page));document.querySelectorAll('.nav-item').forEach(b=>{const active=b.dataset.go===page;b.classList.toggle('active',active);b.setAttribute('aria-current',active?'page':'false');});const titles={overview:'نظرة عامة',replies:'الموظف والردود',orders:'الطلبات',inbox:'المحادثات',team:'فريق العمل',billing:'الاشتراك',admin:'إدارة المنصة'};el('pageTitle').textContent=titles[page]||titles.overview;window.scrollTo({top:0,behavior:'instant'});}
document.querySelectorAll('[data-go]').forEach(b=>b.addEventListener('click',()=>navigate(b.dataset.go)));

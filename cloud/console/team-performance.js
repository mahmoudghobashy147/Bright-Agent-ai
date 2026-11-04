export function setupTeamPerformance({el,api,status,user}){
  const base='/api/company/team-performance/';
  const current=()=>({tenantId:el('tenantId').value,uid:user()?.uid});
  const matches=({tenantId,uid})=>tenantId===el('tenantId').value&&uid===user()?.uid;
  const line=(host,text,tag='p')=>{
    const node=document.createElement(tag);
    node.textContent=text;
    host.append(node);
    return node;
  };
  function button(host,title,work){
    const node=document.createElement('button');
    node.type='button';
    node.textContent=title;
    host.append(node);
    node.addEventListener('click',async()=>{
      node.disabled=true;
      try{await work();}catch(error){status(error.message,true);}
      finally{node.disabled=false;}
    });
  }
  async function load(){
    const context=current();
    if(!context.uid||!context.tenantId)return;
    const data=await api(base+'report?tenantId='+encodeURIComponent(context.tenantId));
    if(!matches(context))return;
    const rows=el('teamPerformanceRows'),review=el('teamTransferReview');
    rows.replaceChildren();
    review.replaceChildren();
    el('teamPerformanceSummary').textContent=
      `واتساب: ${data.whatsapp.inbound} رسالة واردة، منها ${data.whatsapp.local} عبر QR، و${data.whatsapp.manualSent} رد يدوي مرسل. `+
      (data.limited?'التقرير يعرض أحدث 500 سجل لكل نوع وحتى 100 موظف.':'التقرير مبني على السجلات المتاحة.');
    for(const employee of data.employees){
      const card=document.createElement('article');
      card.className='conversation';
      rows.append(card);
      line(card,employee.uid,'h3');
      const presence=!employee.active?'الحساب موقوف':employee.online?'اللوحة مفتوحة مؤخرًا':'غير متصل باللوحة';
      line(card,presence+' · آخر ظهور '+(employee.lastSeenAt?new Date(employee.lastSeenAt).toLocaleString('ar-EG'):'غير مسجل'));
      line(card,`${employee.customers} عميل مختلف بتحويل معتمد · ${employee.approved} طلب مدفوع · ${employee.open} طلب مفتوح · ${employee.pending} إيصال للمراجعة`);
      line(card,`${employee.assignedCustomers} عميل معيّن · ${employee.sent} رد مرسل · متوسط الرد ${employee.responseSeconds===null?'غير متاح':employee.responseSeconds+' ثانية من '+employee.responseSamples+' رسالة'}`);
      for(const task of employee.tasks)line(card,'طلب مفتوح · '+task.name);
    }
    if(!data.review.length)line(review,'مفيش إيصالات تحت المراجعة.');
    for(const order of data.review){
      const item=line(review,'','article');
      item.className='conversation';
      line(item,`${order.customerName||'عميل'} · الموظف ${order.employeeUid}`);
      button(item,'عرض الإيصال',async()=>{
        const proof=await api(base+'proof?tenantId='+encodeURIComponent(context.tenantId)+'&orderId='+encodeURIComponent(order.id));
        if(!matches(context)||!item.isConnected||item.querySelector('img'))return;
        line(item,'مرجع التحويل '+proof.reference);
        const img=document.createElement('img');
        img.alt='صورة إيصال التحويل';
        img.style.maxWidth='100%';
        img.src='data:image/jpeg;base64,'+proof.image;
        item.append(img);
        for(const [action,label] of [['approve','اعتماد بعد مطابقة التحويل'],['reject','رفض الإيصال']]){
          button(item,label,async()=>{
            if(!matches(context)||!item.isConnected)return;
            await api(base+action,{tenantId:context.tenantId,orderId:order.id});
            if(matches(context))await load();
          });
        }
      });
    }
  }
  let timer, generation=0;
  function reset(){
    const revision=++generation;
    clearInterval(timer);
    el('teamPerformancePanel').hidden=true;
    for(const id of ['teamPerformanceRows','teamTransferReview','teamPerformanceSummary'])el(id).replaceChildren();
    const context=current();
    if(!context.uid||!context.tenantId)return;
    async function heartbeat(){
      if(document.visibilityState!=='visible'||!matches(context))return;
      try{await api(base+'presence',{tenantId:context.tenantId});}catch{}
    }
    void heartbeat();
    timer=setInterval(heartbeat,90000);
    api('/api/me/companies').then(data=>{
      if(revision!==generation||!matches(context))return;
      el('teamPerformancePanel').hidden=!data.companies.some(c=>c.id===context.tenantId&&['owner','admin'].includes(c.role));
    }).catch(()=>{});
  }
  async function jpeg(file){
    if(!file||!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>12000000)throw Error('اختر صورة إيصال JPEG أو PNG أو WebP بحجم حتى 12 ميجابايت');
    const image=await createImageBitmap(file);
    try{
      const canvas=document.createElement('canvas'),ratio=Math.min(1,1100/Math.max(image.width,image.height));
      canvas.width=Math.max(1,Math.round(image.width*ratio));
      canvas.height=Math.max(1,Math.round(image.height*ratio));
      const ctx=canvas.getContext('2d');
      ctx.fillStyle='white';
      ctx.fillRect(0,0,canvas.width,canvas.height);
      ctx.drawImage(image,0,0,canvas.width,canvas.height);
      return canvas.toDataURL('image/jpeg',0.75).split(',')[1];
    }finally{image.close();}
  }
  function orderControls(row,order,tenantId){
    const context={tenantId,uid:user()?.uid};
    const details=document.createElement('details');
    row.append(details);
    line(details,'الموظف وإيصال التحويل','summary');
    line(details,'المسؤول '+(order.assignedTo||'لم يعيّن')+' · الإيصال '+({pending:'تحت المراجعة',approved:'معتمد',rejected:'مرفوض'}[order.transferStatus]||'غير مرفق'));
    if(!el('teamPerformancePanel').hidden){
      const uid=document.createElement('input');
      uid.placeholder='معرّف الموظف من تقرير الفريق';
      uid.maxLength=128;
      details.append(uid);
      button(details,'تعيين الموظف',async()=>{
        if(!matches(context))return;
        await api('/api/company/assign-order',{tenantId,orderId:order.id,assigneeUid:uid.value.trim()});
        if(matches(context))el('loadOrders').click();
      });
    }
    if(order.assignedTo&&!['pending','approved'].includes(order.transferStatus)&&order.status!=='cancelled'){
      const file=document.createElement('input'),reference=document.createElement('input');
      file.type='file';
      file.accept='image/jpeg,image/png,image/webp';
      reference.placeholder='مرجع التحويل';
      reference.maxLength=64;
      details.append(file,reference);
      button(details,'إرسال الإيصال للمراجعة',async()=>{
        const image=await jpeg(file.files[0]);
        if(!matches(context))return;
        await api(base+'submit',{tenantId,orderId:order.id,reference:reference.value,image});
        if(matches(context))el('loadOrders').click();
      });
    }
  }
  el('loadTeamPerformance').addEventListener('click',()=>load().catch(error=>status(error.message,true)));
  return {reset,orderControls};
}

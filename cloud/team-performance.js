'use strict';
const {createHash}=require('node:crypto');
const hash=value=>createHash('sha256').update(value).digest('hex');
const fail=(status,message)=>{throw Object.assign(new Error(message),{status});};
const millis=value=>value?.toMillis?.()??(typeof value==='number'?value:Date.parse(value));
function customerKey(contact){
  const number=String(contact||'').trim().split('@')[0].replace(/[^0-9]/g,'');
  return number.length>=7?hash(number.replace(/^0020/,'20').replace(/^01(?=\d{9}$)/,'201')):null;
}
async function teamPerformance({action,method,root,db,user,body,query}){
  const actor=root.collection('members').doc(user.uid);
  const manager=member=>member?.active===true&&['owner','admin'].includes(member.role);
  const now=Date.now();
  if(method==='POST'&&action==='presence'){
    const member=(await actor.get()).data();
    if(member?.active!==true)fail(403,'الحساب موقوف');
    if(!member.lastSeenAt||now-member.lastSeenAt>=60000)await actor.update({lastSeenAt:now});
    return {ok:true};
  }
  if(method==='POST'&&['submit','approve','reject'].includes(action)){
    if(!/^[a-zA-Z0-9_-]{6,100}$/.test(body.orderId||''))fail(400,'اختر طلبًا صالحًا');
    const orderRef=root.collection('orders').doc(body.orderId);
    const proofRef=root.collection('transferProofs').doc(body.orderId);
    let image,reference;
    if(action==='submit'){
      image=String(body.image||'');
      reference=String(body.reference||'').trim().replace(/\s/g,'').toUpperCase();
      if(!/^[A-Z0-9-]{4,64}$/.test(reference))fail(400,'أدخل مرجع التحويل كما يظهر في الإيصال');
      if(image.length>400000||!/^[A-Za-z0-9+/]+={0,2}$/.test(image))fail(400,'الصورة غير صالحة أو أكبر من الحد');
      const bytes=Buffer.from(image,'base64');
      if(bytes.length<4||bytes[0]!==255||bytes[1]!==216||bytes.at(-2)!==255||bytes.at(-1)!==217)fail(400,'الصورة يجب أن تكون JPEG');
    }
    return db.runTransaction(async tx=>{
      const [memberSnap,orderSnap,proofSnap]=await Promise.all([tx.get(actor),tx.get(orderRef),tx.get(proofRef)]);
      const member=memberSnap.data(),order=orderSnap.data(),proof=proofSnap.data();
      if(member?.active!==true)fail(403,'الحساب موقوف');
      if(!order||order.status==='cancelled'||!order.assignedTo||!customerKey(order.contact))fail(400,'الطلب يحتاج موظفًا مسؤولًا ورقم عميل صالحًا');
      if(action==='submit'){
        if(!manager(member)&&order.assignedTo!==user.uid)fail(403,'الطلب مخصص لموظف آخر');
        if(proof&&proof.status!=='rejected')fail(409,'يوجد إيصال قيد المراجعة أو معتمد');
        tx.set(proofRef,{status:'pending',image,reference,submittedBy:user.uid,submittedAt:now,employeeUid:order.assignedTo});
        tx.update(orderRef,{transferStatus:'pending'});
        return {status:'pending'};
      }
      if(!manager(member))fail(403,'المراجعة متاحة للإدارة فقط');
      if(proof?.status===(action==='approve'?'approved':'rejected'))return {status:proof.status};
      if(proof?.status!=='pending')fail(409,'الإيصال غير متاح للمراجعة');
      if(action==='approve'){
        if(proof.employeeUid!==order.assignedTo)fail(409,'تغيّر الموظف المسؤول. ارفض الإيصال وأعد تقديمه بعد التحقق');
        const ref=root.collection('approvedTransferKeys').doc(hash(proof.reference));
        const imageRef=root.collection('approvedTransferKeys').doc(hash(Buffer.from(proof.image,'base64')));
        const [used,usedImage]=await Promise.all([tx.get(ref),tx.get(imageRef)]);
        if(used.exists||usedImage.exists)fail(409,'مرجع التحويل أو صورة الإيصال سبق اعتمادها');
        tx.create(ref,{orderId:body.orderId});
        tx.create(imageRef,{orderId:body.orderId});
      }
      const status=action==='approve'?'approved':'rejected';
      tx.update(proofRef,{status,reviewedBy:user.uid,reviewedAt:now});
      tx.update(orderRef,{transferStatus:status,...(status==='approved'?{creditedEmployee:proof.employeeUid,confirmedAt:now,confirmedCustomer:customerKey(order.contact)}:{})});
      return {status};
    });
  }
  const member=(await actor.get()).data();
  if(!manager(member))fail(403,'التقرير متاح للإدارة فقط');
  if(method==='GET'&&action==='proof'){
    const orderId=query.get('orderId');
    if(!/^[a-zA-Z0-9_-]{6,100}$/.test(orderId||''))fail(400,'معرّف الطلب غير صالح');
    const proof=(await root.collection('transferProofs').doc(orderId).get()).data();
    if(!proof)fail(404,'لا يوجد إيصال');
    return {image:proof.image,reference:proof.reference,status:proof.status};
  }
  if(method!=='GET'||action!=='report')fail(404,'المسار غير موجود');
  const [members,orders,inbox,outbox]=await Promise.all([
    root.collection('members').limit(101).get(),
    root.collection('orders').orderBy('createdAt','desc').limit(501).get(),
    root.collection('whatsappInbox').orderBy('createdAt','desc').limit(501).get(),
    root.collection('whatsappOutbox').orderBy('createdAt','desc').limit(501).get()
  ]);
  const employees=new Map(members.docs.slice(0,100).map(d=>[d.id,{
    uid:d.id,role:d.data().role,active:d.data().active,lastSeenAt:d.data().lastSeenAt||null,
    assigned:0,open:0,tasks:[],sent:0,pending:0,approved:0,customers:new Set(),assignedCustomers:new Set(),firstReplies:new Map()
  }]));
  const orderRows=orders.docs.slice(0,500).map(d=>({id:d.id,...d.data()}));
  for(const order of orderRows){
    const staff=employees.get(order.assignedTo),contact=customerKey(order.contact);
    if(staff&&order.status!=='cancelled'){
      staff.assigned++;
      if(contact)staff.assignedCustomers.add(contact);
      if(!['completed','cancelled'].includes(order.status)){
        staff.open++;
        if(staff.tasks.length<20)staff.tasks.push({name:order.customerName||'عميل',status:order.status||'new'});
      }
      if(order.transferStatus==='pending')staff.pending++;
    }
    const credited=employees.get(order.creditedEmployee);
    if(credited&&order.transferStatus==='approved'&&order.confirmedCustomer){
      credited.approved++;
      credited.customers.add(order.confirmedCustomer);
    }
  }
  const inbound=new Map(inbox.docs.slice(0,500).map(d=>[d.id,d.data()]));
  for(const doc of outbox.docs.slice(0,500)){
    const reply=doc.data(),staff=employees.get(reply.createdBy);
    if(!staff||reply.status!=='sent')continue;
    staff.sent++;
    const original=inbound.get(reply.fromMessageId);
    const elapsed=millis(reply.updatedAt)-(original?.receivedAtMillis??millis(original?.createdAt));
    if(Number.isFinite(elapsed)&&elapsed>=0){
      const previous=staff.firstReplies.get(reply.fromMessageId);
      if(previous===undefined||elapsed<previous)staff.firstReplies.set(reply.fromMessageId,elapsed);
    }
  }
  return {
    generatedAt:now,limited:[members.size>100,orders.size>500,inbox.size>500,outbox.size>500].some(Boolean),
    whatsapp:{inbound:inbound.size,local:[...inbound.values()].filter(m=>m.source==='local_qr').length,manualSent:[...employees.values()].reduce((sum,e)=>sum+e.sent,0)},
    employees:[...employees.values()].map(({customers,assignedCustomers,firstReplies,...employee})=>({
      ...employee,online:employee.active===true&&now-(employee.lastSeenAt||0)<180000,
      customers:customers.size,assignedCustomers:assignedCustomers.size,responseSamples:firstReplies.size,
      responseSeconds:firstReplies.size?Math.round([...firstReplies.values()].reduce((a,b)=>a+b,0)/firstReplies.size/1000):null
    })),
    review:orderRows.filter(o=>o.transferStatus==='pending').map(o=>({id:o.id,customerName:o.customerName||'',employeeUid:o.assignedTo}))
  };
}
module.exports={teamPerformance};

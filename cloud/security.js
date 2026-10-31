'use strict';
const {PLANS}=require('./billing-plans');
function validDate(value){
 return typeof value==='string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value+'T00:00:00Z')) && new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;
}
function subscriptionActive(c,now=new Date()){
 return !!c && ['active','trial'].includes(c.subscriptionStatus) && validDate(c.renewalDate) && c.renewalDate>=now.toISOString().slice(0,10);
}
function requireSendingEnabled(env=process.env){
 if(env.BRIGHT_ALLOW_CUSTOMER_SENDS!=='true')throw Object.assign(Error('customer sending is disabled by the operator'),{status:403});
}
async function reserveAi({db,tenantRef,plans,now=new Date()}){
 const month=now.toISOString().slice(0,7),usage=tenantRef.collection('usage').doc(month);
 await db.runTransaction(async tx=>{
  const [company,snapshot]=await Promise.all([tx.get(tenantRef),tx.get(usage)]);
  const tenant=company.data(),plan=plans[tenant?.plan];
  if(!company.exists||!plan||!subscriptionActive(tenant,now))throw Object.assign(Error('subscription inactive'),{status:403});
  const used=snapshot.data()?.reserved||0;
  if(!Number.isSafeInteger(used)||used<0)throw Error('invalid usage counter');
  if(used>=plan.limit)throw Object.assign(Error('monthly quota exceeded'),{status:429});
  tx.set(usage,{month,reserved:used+1},{merge:true});
 });
}
module.exports={validDate,subscriptionActive,requireSendingEnabled,reserveAi};

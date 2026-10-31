'use strict';
// Pure state machine. A payment provider adapter must verify webhook signatures
// and transaction settlement before calling decideEvent(). Never trust browser events.
const {PLANS}=require('./billing-plans');
const EVENTS=new Set(['payment_succeeded','payment_failed','subscription_cancelled','refund_completed']);
const isoDate=x=>typeof x==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(x)&&!Number.isNaN(Date.parse(x+'T00:00:00Z'))&&new Date(x+'T00:00:00Z').toISOString().slice(0,10)===x;
function decideEvent({event,subscription,verified=false}){
 if(!verified)throw Error('Verified processor callback required');
 if(!event||!EVENTS.has(event.type)||typeof event.id!=='string'||event.id.length<8)throw Error('Invalid payment event');
 if(!subscription||!Object.hasOwn(PLANS,subscription.plan))throw Error('Invalid subscription');
 if(event.type==='payment_succeeded'){
  if(!Object.hasOwn(PLANS,event.plan)||event.plan!==subscription.plan||!isoDate(event.paidThrough))throw Error('Invalid payment term');
  if(!Number.isSafeInteger(event.amountMinor)||event.amountMinor!==PLANS[event.plan].priceEGP*100||event.currency!=='EGP')throw Error('Amount mismatch');
  return {subscriptionStatus:'active',renewalDate:event.paidThrough,plan:event.plan};
 }
 if(event.type==='payment_failed')return {subscriptionStatus:'past_due'};
 if(event.type==='subscription_cancelled')return {subscriptionStatus:'suspended'};
 return {subscriptionStatus:'suspended'};
}
function startCheckout({tenantId,plan}){
 if(typeof tenantId!=='string'||!/^[a-zA-Z0-9_-]{6,100}$/.test(tenantId)||!Object.hasOwn(PLANS,plan))throw Error('Invalid checkout');
 // Deliberately never claims payment has happened.
 return {tenantId,plan,priceEGP:PLANS[plan].priceEGP,currency:'EGP',status:'provider_not_connected'};
}
module.exports={decideEvent,startCheckout,isoDate};

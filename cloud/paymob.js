'use strict';
// Merchant-specific sandbox adapter. Production charging remains locked.
const crypto=require('node:crypto');
const FIELDS=['amount_cents','created_at','currency','error_occured','has_parent_transaction','id','integration_id','is_3d_secure','is_auth','is_capture','is_refunded','is_standalone_payment','is_voided','order.id','owner','pending','source_data.pan','source_data.sub_type','source_data.type','success'];
const read=(o,p)=>p.split('.').reduce((v,k)=>v?.[k],o);
function signature(obj,secret){return crypto.createHmac('sha512',secret).update(FIELDS.map(k=>{const v=read(obj,k);return v===null||v===undefined?'':String(v);}).join('')).digest('hex');}
function verified(body,hmac,secret){
 if(!secret||!body?.obj||typeof hmac!=='string'||!/^\p{ASCII}{128}$/u.test(hmac)||!/^[a-f0-9]{128}$/i.test(hmac))return false;
 return crypto.timingSafeEqual(Buffer.from(signature(body.obj,secret),'hex'),Buffer.from(hmac,'hex'));
}
function sandboxConfig(env=process.env){
 if(env.BRIGHT_PAYMENTS_MODE!=='sandbox'||!/^sk_test_/.test(env.PAYMOB_SECRET_KEY||'')||!/^pk_test_/.test(env.PAYMOB_PUBLIC_KEY||''))throw Object.assign(Error('sandbox payment gateway not configured; live payments locked'),{status:503});
 if(!/^\d+$/.test(env.PAYMOB_INTEGRATION_ID||'')||!env.PAYMOB_HMAC_SECRET)throw Object.assign(Error('payment integration incomplete'),{status:503});
 const base=new URL(env.BRIGHT_PUBLIC_URL);
 if(base.protocol!=='https:'||base.username||base.password||base.pathname!=='/')throw Error('HTTPS public base URL required');
 return {secret:env.PAYMOB_SECRET_KEY,publicKey:env.PAYMOB_PUBLIC_KEY,integration:Number(env.PAYMOB_INTEGRATION_ID),base:base.origin};
}
async function createIntention({invoiceId,plan,billing,env=process.env,fetchImpl=fetch}){
 const c=sandboxConfig(env);
 if(!billing||!['first_name','last_name','email','phone_number'].every(k=>typeof billing[k]==='string'&&billing[k].trim().length>0&&billing[k].length<=150))throw Object.assign(Error('billing name, email and phone required'),{status:400});
 if(!/^\S+@\S+\.\S+$/.test(billing.email)||!/^\+?[\d ]{8,20}$/.test(billing.phone_number))throw Object.assign(Error('invalid billing details'),{status:400});
 const body={amount:plan.priceEGP*100,currency:'EGP',payment_methods:[c.integration],items:[{name:'Bright Ai monthly subscription',amount:plan.priceEGP*100,quantity:1}],billing_data:{...Object.fromEntries(['first_name','last_name','email','phone_number'].map(k=>[k,billing[k].trim()])),country:'EG'},special_reference:invoiceId,expiration:3600,notification_url:c.base+'/webhooks/paymob',redirection_url:c.base+'/console/'};
 const r=await fetchImpl('https://accept.paymob.com/v1/intention/',{method:'POST',headers:{Authorization:'Token '+c.secret,'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(18000)});
 if(!r.ok)throw Object.assign(Error('payment provider unavailable'),{status:502});
 const data=await r.json();
 const orderId=String(data.intention_order_id??'');
 if(!/^\d+$/.test(orderId)||typeof data.client_secret!=='string'||!data.client_secret)throw Error('unexpected Paymob response; reconcile invoice before retry');
 const url=new URL('https://accept.paymob.com/unifiedcheckout/');url.searchParams.set('publicKey',c.publicKey);url.searchParams.set('clientSecret',data.client_secret);
 return {orderId,url:url.toString()};
}
function classify(obj,invoice,integration){
 if(String(obj.order?.id)!==invoice.providerOrderId||obj.integration_id!==integration||obj.currency!=='EGP'||obj.amount_cents!==invoice.amountMinor)throw Object.assign(Error('payment binding mismatch'),{status:400});
 if(obj.is_refunded===true||obj.is_voided===true)return 'reversed';
 if(obj.pending===true)return 'pending';
 if(obj.success===true&&obj.error_occured===false&&obj.is_auth===false&&obj.is_standalone_payment===true)return 'test_paid';
 return 'failed';
}
module.exports={signature,verified,sandboxConfig,createIntention,classify};

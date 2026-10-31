'use strict';
// Conservative, review-first extraction. Never confirms payment, fulfillment or price.
function orderIntent(text){
 const value=String(text||'').trim().slice(0,1500);
 const trigger=/(?:عايز|عاوز|أريد|اريد|محتاج|أطلب|اطلب|احجز|حجز|طلب|اشتري|شراء|order|book|buy|purchase)/i;
 const questionOnly=/^(?:كام|بكام|هل|ايه|إيه|ممكن معلومات|how much|what is)/i;
 if(value.length<12||!trigger.test(value)||questionOnly.test(value))return null;
 return {customerName:'عميل واتساب',details:value,source:'whatsapp',status:'pending_review',confidence:'rule_based',requiresHumanReview:true};
}
module.exports={orderIntent};

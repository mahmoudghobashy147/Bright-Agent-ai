'use strict';
// Catalog only. Not a payment processor.
const PLANS=Object.freeze({starter:Object.freeze({priceEGP:499,replies:500}),business:Object.freeze({priceEGP:999,replies:2000}),pro:Object.freeze({priceEGP:1999,replies:5000})});
function planFor(x){return Object.hasOwn(PLANS,x)?PLANS[x]:null;}
module.exports={PLANS,planFor};

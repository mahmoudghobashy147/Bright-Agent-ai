'use strict';
const assert=require('node:assert/strict');
const {PLANS,isId,active,allowedOrigin,rateLimiter,agentSettings,superAdmin}=require('./service');
assert.deepEqual(Object.keys(PLANS),['starter','business','pro']);
assert.equal(PLANS.pro.limit,5000);
assert.equal(isId('tenant-123'),true);
assert.equal(isId('../../etc'),false);
assert.equal(active({subscriptionStatus:'active',renewalDate:'2099-01-01'}),true);
assert.equal(active({subscriptionStatus:'suspended'}),false);
assert.equal(active({subscriptionStatus:'active',renewalDate:'2000-01-01'}),false);
assert.equal(allowedOrigin('https://example.com',new Set(['https://example.com'])),true);
assert.equal(allowedOrigin('https://evil.example',new Set(['https://example.com'])),false);
const check=rateLimiter(2,60000);assert.equal(check('x'),true);assert.equal(check('x'),true);assert.equal(check('x'),false);
console.log('Cloud utilities tests passed');

assert.equal(superAdmin({brightSuperAdmin:true}),true);
assert.equal(superAdmin({admin:true}),false);
assert.equal(agentSettings({greeting:"x".repeat(700)}).greeting.length,500);

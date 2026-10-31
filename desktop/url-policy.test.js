'use strict';
const assert=require('node:assert/strict');
const {validatedTarget,allowedNavigation}=require('./url-policy');
for(const u of ['http://localhost:8080/console/','http://example.com/console/','https://user:pass@example.com/console/','https://example.com/other','javascript:alert(1)','https://example.com/console/#x'])assert.throws(()=>validatedTarget(u));
const target=validatedTarget('https://agent.example.com/console/');
assert.equal(allowedNavigation(target,'https://agent.example.com/console/index.html'),true);
for(const u of ['https://agent.example.com.evil.tld/console/','https://agent.example.com/evil','https://evil.tld/console/','javascript:alert(1)'])assert.equal(allowedNavigation(target,u),false);
assert.equal(allowedNavigation(validatedTarget('http://127.0.0.1:8080/console/'),'http://127.0.0.1:8080/console/'),true);
console.log('Desktop URL policy tests passed');

'use strict';
const assert=require('node:assert/strict');const {cloudTarget}=require('./config');
assert.equal(cloudTarget('https://dashboard.example.com/console/'),'https://dashboard.example.com/console/');
for(const x of ['http://127.0.0.1:8080/console/','javascript:alert(1)','https://a.test/console/?token=x','https://u:p@a.test/console/','https://a.test/other'])assert.throws(()=>cloudTarget(x));
console.log('Desktop cloud configuration validation passed');

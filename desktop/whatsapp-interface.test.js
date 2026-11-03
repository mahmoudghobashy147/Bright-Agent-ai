'use strict';
const assert=require('node:assert/strict'),{allowedWhatsApp,chromiumUserAgent,companyPartition}=require('./whatsapp-interface');
for(const url of ['http://web.whatsapp.com/','https://evil.test/','https://web.whatsapp.com.evil.test/','https://user@web.whatsapp.com/','javascript:alert(1)','file:///tmp/test'])assert.equal(allowedWhatsApp(url),false,url);
assert.equal(allowedWhatsApp('https://web.whatsapp.com/'),true);
const a={tenantId:'company001',uid:'owner001',origin:'https://test.example'};
assert.equal(companyPartition(a),companyPartition(a));for(const change of [{tenantId:'company002'},{uid:'other001'},{origin:'https://other.example'}])assert.notEqual(companyPartition(a),companyPartition({...a,...change}));assert.throws(()=>companyPartition({...a,tenantId:'../x'}));
const ua=chromiumUserAgent('Mozilla/5.0 Chrome/154.0.0.0 Bright-Ai/26.4.0 Electron/45.2.1 Safari/537.36');assert.match(ua,/Chrome\/154\.0\.0\.0/);assert.doesNotMatch(ua,/Electron|Bright-Ai/);
console.log('WhatsApp interface navigation and company-session isolation passed');

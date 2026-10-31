'use strict';
const assert=require('node:assert/strict');
const {assess}=require('./readiness');
let r=assess({});assert.equal(r.ready,false);assert.equal(r.checks.length,10);
const env={GOOGLE_CLOUD_PROJECT:'bright-ai-prod',BRIGHT_FIREBASE_PROJECT_ID:'bright-ai-prod',BRIGHT_ALLOWED_ORIGINS:'https://app.example.org',OPENAI_API_KEY:'test',WA_VERIFY_TOKEN:'test',WA_APP_SECRET:'test',WA_ACCESS_TOKEN:'test',WA_GRAPH_VERSION:'v23.0'};
r=assess(env);assert.equal(r.checks.find(c=>c.id==='firebase_project').ok,true);assert.equal(r.checks.find(c=>c.id==='payments').ok,false);
assert.equal(assess({...env,BRIGHT_ALLOWED_ORIGINS:'http://example.org'}).checks.find(c=>c.id==='allowed_origins').ok,false);
assert.equal(assess({...env,BRIGHT_FIREBASE_PROJECT_ID:'wrong'}).checks.find(c=>c.id==='firebase_project').ok,false);
const output=JSON.stringify(r);assert.equal(output.includes('test'),true); // the word 'test' occurs in a check id; actual secret values must not appear
const privateEnv={...env,OPENAI_API_KEY:'VERY_SECRET_VALUE'};assert.equal(JSON.stringify(assess(privateEnv)).includes('VERY_SECRET_VALUE'),false);
console.log('V25 readiness checks passed');

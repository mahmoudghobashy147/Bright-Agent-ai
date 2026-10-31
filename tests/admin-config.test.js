'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),http=require('node:http');
const {makeService}=require('../cloud/service');const {memoryStore}=require('./memory-store');
test('server-side admin allowlist never grants privileges to another signed-in user',async t=>{
 const db=memoryStore();const server=http.createServer(makeService({db,admin:{},auth:{verifyIdToken:async uid=>({uid})},superAdminUids:new Set(['approved001'])}));
 await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));const url='http://127.0.0.1:'+server.address().port;
 for(const [uid,expected] of [['approved001',200],['other001',403]]){const r=await fetch(url+'/api/admin/companies',{headers:{Authorization:'Bearer '+uid}});assert.equal(r.status,expected);}
});

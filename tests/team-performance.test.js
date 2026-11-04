'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {teamPerformance}=require('../cloud/team-performance');
const {memoryStore}=require('./memory-store');

test('a verified transfer credits a unique customer to the assigned employee and prevents duplicate approval',async()=>{
  const db=memoryStore(),root=db.collection('brightAiTenants').doc('company001');
  await root.collection('members').doc('manager').set({role:'owner',active:true});
  await root.collection('members').doc('employee').set({role:'staff',active:true});
  for(const id of ['order001','order002','order003']){
    await root.collection('orders').doc(id).set({createdAt:Date.now(),assignedTo:'employee',contact:'01012345678',status:'new'});
  }
  const call=(uid,action,body={},method='POST')=>teamPerformance({root,db,user:{uid},action,body,method,query:new URLSearchParams()});
  const image=Buffer.from([255,216,1,255,217]).toString('base64');
  await call('employee','submit',{orderId:'order001',reference:'BANK001',image});
  await assert.rejects(call('employee','approve',{orderId:'order001'}),{status:403});
  let report=await call('manager','report',{},'GET');
  assert.equal(report.review.length,1);
  assert.equal(report.employees.find(e=>e.uid==='employee').customers,0);
  await call('manager','approve',{orderId:'order001'});
  await call('manager','approve',{orderId:'order001'});
  await call('employee','submit',{orderId:'order002',reference:'BANK002',image});
  await assert.rejects(call('manager','approve',{orderId:'order002'}),{status:409});
  await call('employee','submit',{orderId:'order003',reference:'BANK003',image:Buffer.from([255,216,2,255,217]).toString('base64')});
  await call('manager','approve',{orderId:'order003'});
  report=await call('manager','report',{},'GET');
  const employee=report.employees.find(e=>e.uid==='employee');
  assert.equal(employee.customers,1);
  assert.equal(employee.approved,2);
  await assert.rejects(call('employee','report',{},'GET'),{status:403});
});

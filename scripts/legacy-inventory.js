'use strict';
// READ ONLY. Lists collection counts; never deletes, updates, or exports customer content.
const fs=require('node:fs');const path=require('node:path');
(async()=>{
 if(process.env.BRIGHT_FIREBASE_PROJECT_ID!=='bright-33420')throw Error('Expected project bright-33420');
 const admin=require('../cloud/node_modules/firebase-admin');admin.initializeApp({credential:admin.credential.applicationDefault(),projectId:'bright-33420'});
 const db=admin.firestore();const rows=[];
 for(const col of await db.listCollections()){
  const count=await col.count().get();rows.push({name:col.id,count:count.data().count,classification:col.id.startsWith('brightAi')?'protected-bright-ai':'unreviewed-legacy-candidate',approvedForDeletion:false});
 }
 const output=path.resolve('artifacts/legacy-inventory.json');fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify({project:'bright-33420',time:new Date().toISOString(),readOnly:true,collections:rows,warning:'No collection is approved for deletion. Subcollections, Auth, Storage, RTDB, Functions, Hosting and indexes require separate inventory.'},null,2));console.log('Read-only inventory written. No data modified.');
})().catch(e=>{console.error(e.message);process.exitCode=1;});

'use strict';
// Deterministic test double only; not Firebase, not a production storage option.
const crypto=require('node:crypto');
function memoryStore(){
 const data=new Map();let queue=Promise.resolve();
 function ref(path){return {path,id:path.split('/').at(-1),collection:name=>collection(path+'/'+name),get:async()=>snapshot(path),create:async value=>{if(data.has(path))throw Object.assign(Error('exists'),{code:6});data.set(path,structuredClone(value));},set:async(value,options)=>data.set(path,options?.merge?{...data.get(path),...structuredClone(value)}:structuredClone(value)),update:async value=>{if(!data.has(path))throw Error('missing document');data.set(path,{...data.get(path),...structuredClone(value)});}};}
 function snapshot(path){return {id:path.split('/').at(-1),ref:ref(path),exists:data.has(path),data:()=>structuredClone(data.get(path))};}
 function collection(path,filters=[],max=Infinity,sort){return {doc:id=>ref(path+'/'+(id||crypto.randomBytes(10).toString('hex'))),where:(key,op,value)=>collection(path,[...filters,{key,op,value}],max,sort),limit:n=>collection(path,filters,n,sort),orderBy:(key,direction)=>collection(path,filters,max,{key,direction}),get:async()=>{let docs=[...data.keys()].filter(k=>k.startsWith(path+'/')&&k.split('/').length===path.split('/').length+1).map(snapshot).filter(d=>filters.every(f=>f.op==='array-contains'?d.data()[f.key]?.includes(f.value):d.data()[f.key]===f.value));if(sort)docs.sort((a,b)=>{const av=a.data()[sort.key],bv=b.data()[sort.key];return (av<bv?-1:av>bv?1:0)*(sort.direction==='desc'?-1:1);});docs=docs.slice(0,max);return {docs,size:docs.length,empty:!docs.length};}};}
 return {data,collection,runTransaction:fn=>{const next=queue.then(async()=>{let wrote=false;const staged=[];const tx={get:async r=>{if(wrote)throw Error('Firestore forbids reads after writes');return r.get();}};for(const method of ['create','set','update'])tx[method]=(r,...args)=>{wrote=true;staged.push([r,method,args]);};const result=await fn(tx);for(const [r,method,args] of staged)await r[method](...args);return result;});queue=next.catch(()=>{});return next;}};
}
module.exports={memoryStore};

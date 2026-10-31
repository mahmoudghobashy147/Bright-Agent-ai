'use strict';
// Server-side configuration audit. Never print secret values.
const https = s => { try {const u=new URL(s);return u.protocol==='https:' && !!u.hostname && !u.username && !u.password;}catch{return false;} };
function assess(env={}){
 const checks=[];
 const add=(id,pass,detail)=>checks.push({id,ok:!!pass,detail});
 const project=(env.GOOGLE_CLOUD_PROJECT||'').trim(),firebase=(env.BRIGHT_FIREBASE_PROJECT_ID||'').trim();
 add('firebase_project',!!project&&project===firebase&&project!=='bright-ai-project-id','Both project IDs must match a real Firebase project');
 const origins=(env.BRIGHT_ALLOWED_ORIGINS||'').split(',').map(x=>x.trim()).filter(Boolean);
 add('allowed_origins',origins.length>0&&origins.every(https),'Configure HTTPS production origins only');
 add('openai_key',!!(env.OPENAI_API_KEY||'').trim(),'Set OPENAI_API_KEY on server, never in the browser');
 add('whatsapp_verify',!!(env.WA_VERIFY_TOKEN||'').trim(),'Set the Meta webhook verification token');
 add('whatsapp_signature',!!(env.WA_APP_SECRET||'').trim(),'Set WA_APP_SECRET for signature validation');
 add('whatsapp_send',!!(env.WA_ACCESS_TOKEN||'').trim()&&/^v\d+\.\d+$/.test(env.WA_GRAPH_VERSION||''),'Configure Meta access token and supported Graph API version');
 add('payments',false,'Sandbox Paymob adapter exists; real merchant verification, live billing and recurring charges are not complete');
 add('automatic_delivery',false,'Automatic WhatsApp delivery is deliberately disabled, requires safe opt-in and integration tests');
 add('windows_installer',false,'Windows NSIS executable must be built and tested on Windows');
 add('cloud_integration_test',false,'Verify Firebase, OpenAI and Meta against sandbox/real accounts before launch');
 return {ready:checks.every(c=>c.ok),checks};
}
if(require.main===module){const result=assess(process.env);for(const c of result.checks)console.log(`${c.ok?'PASS':'TODO'} ${c.id}: ${c.detail}`);process.exitCode=result.ready?0:2;}
module.exports={assess};

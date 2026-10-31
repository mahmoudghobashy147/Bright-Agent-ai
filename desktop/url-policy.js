'use strict';
// Only the configured cloud console or IPv4 loopback development server may load.
function validatedTarget(value){
  let url;
  try { url=new URL(value); } catch { throw Error('Invalid Bright Ai URL'); }
  const isLocal=url.protocol==='http:'&&url.hostname==='127.0.0.1';
  const isCloud=url.protocol==='https:';
  if ((!isLocal&&!isCloud)||url.username||url.password||url.hash||url.port==='0') throw Error('Unsafe Bright Ai URL');
  if(url.pathname!=='/console/'&&url.pathname!=='/console/index.html')throw Error('Only the company console may open');
  return url;
}
function allowedNavigation(target,candidate){
  try {const u=new URL(candidate); return u.origin===target.origin && (u.pathname==='/console/'||u.pathname==='/console/index.html'); }
  catch{return false;}
}
module.exports={validatedTarget,allowedNavigation};

'use strict';
// WhatsApp rejects the embedded browser. Use the user's supported browser.
// This launcher accepts no URL from the renderer or any customer content.
const WHATSAPP_URL='https://web.whatsapp.com/';
function createWhatsAppLauncher({shell,dialog}){
 let opening;
 return function open(){
  if(opening)return opening;
  opening=(async()=>{
   await Promise.resolve();
   try{await shell.openExternal(WHATSAPP_URL);return {opened:true};}
   catch{dialog.showErrorBox('Bright Ai — WhatsApp','تعذر فتح متصفح جهازك. افتح المتصفح بنفسك واكتب: https://web.whatsapp.com/');return {opened:false};}
   finally{opening=null;}
  })();
  return opening;
 };
}
module.exports={WHATSAPP_URL,createWhatsAppLauncher};

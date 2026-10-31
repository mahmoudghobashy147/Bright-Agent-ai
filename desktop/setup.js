document.getElementById('connect').addEventListener('submit',async event=>{
 event.preventDefault();const button=document.getElementById('submit'),status=document.getElementById('status');button.disabled=true;status.textContent='جارٍ الاتصال...';
 try{await window.brightSetup.connect(document.getElementById('server').value.trim());}catch{status.textContent='تعذر الاتصال. تحقق من رابط HTTPS وأن مساره /console/ ومن تشغيل الخادم.';}finally{button.disabled=false;}
});

'use strict';
window.brightWaWeb.onStatus(text=>document.getElementById('state').textContent=text);
for(const button of document.querySelectorAll('[data-action]'))button.addEventListener('click',()=>window.brightWaWeb.action(button.dataset.action).catch(()=>document.getElementById('state').textContent='تعذر تنفيذ الإجراء؛ ارجع للبرنامج وحاول مجددًا.'));

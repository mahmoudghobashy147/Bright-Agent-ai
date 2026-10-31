'use strict';
const assert=require('node:assert/strict');
const {_electron}=require('../desktop/node_modules/playwright');
(async()=>{
 const electron=await _electron.launch({executablePath:process.env.BRIGHT_INSTALLED_EXE,args:[],timeout:30000});
 try{
  const page=await electron.firstWindow();await page.waitForSelector('#connect');
  assert.equal(await page.locator('h1').textContent(),'Bright Ai');
  await page.locator('#server').fill('http://127.0.0.1:8080/console/');await page.locator('#submit').click();
  await page.waitForFunction(()=>document.getElementById('status').textContent.includes('تعذر'));
  await page.screenshot({path:'artifacts/windows-setup.png'});
 }finally{await electron.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});

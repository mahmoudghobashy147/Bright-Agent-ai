'use strict';
const fs=require('node:fs');const path=require('node:path');const {execFileSync}=require('node:child_process');
for(const name of fs.readdirSync(__dirname).filter(n=>n.endsWith('.js')&&!n.endsWith('.test.js')&&n!=='test.js'))execFileSync(process.execPath,['--check',path.join(__dirname,name)],{stdio:'inherit'});
for(const name of ['console/index.html','console/app.js','console/firebase-config.js','widget.js','package-lock.json'])if(!fs.statSync(path.join(__dirname,name)).isFile())throw Error('Missing runtime asset: '+name);
fs.mkdirSync(path.join(__dirname,'.apphosting'),{recursive:true});
fs.writeFileSync(path.join(__dirname,'.apphosting/bundle.yaml'),`version: v1
runConfig:
  runCommand: node service.js
  cpu: 1
  memoryMiB: 512
  concurrency: 20
  minInstances: 0
  maxInstances: 1
outputFiles:
  serverApp:
    include:
      - .
`);
console.log('Bright Ai Node server bundle prepared. No external credentials used.');

'use strict';
const fs=require('node:fs'),path=require('node:path');const root=path.resolve(__dirname,'..');
const patterns=[/-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/,/\bsk-(?:proj-)?[A-Za-z0-9_-]{24,}/,/\bsk_(?:live|test)_[A-Za-z0-9]{20,}/,/\bgh[pousr]_[A-Za-z0-9]{30,}/,/\bgithub_pat_[A-Za-z0-9_]{30,}/,/"private_key"\s*:\s*"(?!["\s])/];
const failures=[];
function walk(dir){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){if(['.git','node_modules','artifacts','dist','backups'].includes(entry.name))continue;const file=path.join(dir,entry.name);if(entry.isDirectory())walk(file);else{const relative=path.relative(root,file);if(/^\.env(?:\..+)?$/.test(entry.name)&&entry.name!=='.env.example')failures.push(relative);else if(patterns.some(p=>p.test(fs.readFileSync(file,'utf8'))))failures.push(relative);}}}
walk(root);if(failures.length){console.error('Potential secret files (values withheld):',failures);process.exitCode=1;}else console.log('Secret pattern scan passed; manual review still required.');

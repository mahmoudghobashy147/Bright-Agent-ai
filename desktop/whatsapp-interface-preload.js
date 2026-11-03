'use strict';
const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('brightWaWeb',Object.freeze({action:action=>ipcRenderer.invoke('bright:wa:web:action',action),onStatus:callback=>{const listener=(_e,text)=>callback(String(text));ipcRenderer.on('bright:wa:web:status',listener);return ()=>ipcRenderer.removeListener('bright:wa:web:status',listener);}}));

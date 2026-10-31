'use strict';
const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('brightSetup',Object.freeze({connect:url=>ipcRenderer.invoke('bright:connect',url)}));

contextBridge.exposeInMainWorld('brightWhatsApp',Object.freeze({start:input=>ipcRenderer.invoke('bright:wa:start',input),stop:()=>ipcRenderer.invoke('bright:wa:stop'),ack:input=>ipcRenderer.invoke('bright:wa:ack',input),onStatus:callback=>{const listener=(_event,data)=>callback(data);ipcRenderer.on('bright:wa:status',listener);return ()=>ipcRenderer.removeListener('bright:wa:status',listener);},onIncoming:callback=>{const listener=(_event,data)=>callback(data);ipcRenderer.on('bright:wa:incoming',listener);return ()=>ipcRenderer.removeListener('bright:wa:incoming',listener);}}));

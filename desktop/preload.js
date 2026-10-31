'use strict';
const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('brightSetup',Object.freeze({connect:url=>ipcRenderer.invoke('bright:connect',url)}));

// preload.js - Script de pré-carregamento seguro

const { contextBridge, ipcRenderer } = require('electron');

// Expõe um objeto 'electronAPI' para o processo de renderização (renderer.js)
// Isso permite uma comunicação segura entre o frontend e o backend (main.js)
contextBridge.exposeInMainWorld('electronAPI', {
  // Função para enviar um pedido de alternância de tela cheia para o processo principal
  toggleFullscreen: () => ipcRenderer.send('toggle-fullscreen')
});

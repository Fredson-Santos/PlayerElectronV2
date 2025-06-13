// main.js - Processo principal do Electron

const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');

// Função para criar a janela principal do aplicativo
function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 940,
    minHeight: 600,
    backgroundColor: '#181818',
    webPreferences: {
      // Anexa o script de pré-carregamento ao processo de renderização
      // Isso é crucial para expor APIs do Node.js de forma segura
      preload: path.join(__dirname, 'preload.js'),
      // Permitir o uso de APIs do Node.js no processo de renderização (não recomendado para produção sem um preload seguro)
      nodeIntegration: false,
      contextIsolation: true,
    },
    icon: path.join(__dirname, 'icon.png') // Opcional: adicione um ícone
  });

  // Carrega o arquivo HTML principal na janela
  mainWindow.loadFile('index.html');
  
  // Opcional: Abrir as ferramentas de desenvolvedor (DevTools)
  // mainWindow.webContents.openDevTools();

  // Gerencia o evento de tela cheia
  ipcMain.on('toggle-fullscreen', () => {
    mainWindow.setFullScreen(!mainWindow.isFullScreen());
  });
}

// Este método será chamado quando o Electron terminar a inicialização
// e estiver pronto para criar janelas do navegador.
app.whenReady().then(() => {
  createWindow();

  // Gerencia o comportamento do app em macOS
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// Encerra o aplicativo quando todas as janelas forem fechadas, exceto no macOS.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

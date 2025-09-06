// PlayNexus Subdomain Hunter - Preload Script
// Owner: Nortaq | Contact: playnexushq@gmail.com

const { contextBridge, ipcRenderer } = require('electron');

// Expose secure API to renderer process
contextBridge.exposeInMainWorld('electronAPI', {
    // Subdomain hunting
    huntSubdomains: (data) => ipcRenderer.invoke('hunt-subdomains', data),
    
    // DNS operations
    dnsLookup: (data) => ipcRenderer.invoke('dns-lookup', data),
    reverseDns: (data) => ipcRenderer.invoke('reverse-dns', data),
    
    // File operations
    importWordlist: () => ipcRenderer.invoke('import-wordlist'),
    exportResults: (data) => ipcRenderer.invoke('export-results', data),
    
    // Settings
    getSettings: () => ipcRenderer.invoke('get-settings'),
    saveSettings: (settings) => ipcRenderer.invoke('save-settings', settings),
    
    // History
    saveToHistory: (data) => ipcRenderer.invoke('save-to-history', data),
    
    // Progress updates
    onHuntProgress: (callback) => {
        ipcRenderer.on('hunt-progress', (event, data) => callback(data));
    },
    
    // Menu events
    onMenuAction: (callback) => {
        ipcRenderer.on('menu-action', (event, action) => callback(action));
    }
});

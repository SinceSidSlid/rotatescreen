const { contextBridge } = require('electron');
const fs = require('fs');
const path = require('path');

function loadConfig() {
  return JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf-8'));
}

function loadNotes() {
  return JSON.parse(fs.readFileSync(path.join(__dirname, 'notes.json'), 'utf-8'));
}

contextBridge.exposeInMainWorld('kioskAPI', {
  getConfig: () => loadConfig(),
  getNotes: () => loadNotes(),
});

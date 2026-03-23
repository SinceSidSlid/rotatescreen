const express = require('express');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const os = require('os');

const NOTES_PATH = path.join(__dirname, 'notes.json');
const CONFIG_PATH = path.join(__dirname, 'config.json');

function readJSON(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

function writeJSON(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

function getLocalIP() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return '127.0.0.1';
}

function startServer(port) {
  return new Promise((resolve, reject) => {
    const app = express();
    app.use(express.json());

    // Serve management UI
    app.get('/', (req, res) => {
      res.send(managementHTML(port));
    });

    // Notes API
    app.get('/api/notes', (req, res) => {
      res.json(readJSON(NOTES_PATH));
    });

    app.post('/api/notes', (req, res) => {
      const notes = readJSON(NOTES_PATH);
      const note = {
        id: uuidv4(),
        title: req.body.title || '',
        body: req.body.body || '',
        createdAt: new Date().toISOString(),
      };
      notes.push(note);
      writeJSON(NOTES_PATH, notes);
      res.status(201).json(note);
    });

    app.put('/api/notes/:id', (req, res) => {
      const notes = readJSON(NOTES_PATH);
      const idx = notes.findIndex((n) => n.id === req.params.id);
      if (idx === -1) return res.status(404).json({ error: 'Not found' });
      notes[idx] = { ...notes[idx], title: req.body.title, body: req.body.body };
      writeJSON(NOTES_PATH, notes);
      res.json(notes[idx]);
    });

    app.delete('/api/notes/:id', (req, res) => {
      let notes = readJSON(NOTES_PATH);
      const idx = notes.findIndex((n) => n.id === req.params.id);
      if (idx === -1) return res.status(404).json({ error: 'Not found' });
      notes.splice(idx, 1);
      writeJSON(NOTES_PATH, notes);
      res.json({ ok: true });
    });

    // Config API
    app.get('/api/config', (req, res) => {
      res.json(readJSON(CONFIG_PATH));
    });

    app.put('/api/config', (req, res) => {
      const config = readJSON(CONFIG_PATH);
      if (req.body.calendarIntervalSeconds != null) {
        config.calendarIntervalSeconds = Number(req.body.calendarIntervalSeconds);
      }
      if (req.body.noteIntervalSeconds != null) {
        config.noteIntervalSeconds = Number(req.body.noteIntervalSeconds);
      }
      if (req.body.calendarEmbedUrl != null) {
        config.calendarEmbedUrl = req.body.calendarEmbedUrl;
      }
      writeJSON(CONFIG_PATH, config);
      res.json(config);
    });

    const server = app.listen(port, '0.0.0.0', () => {
      console.log(`Management server at http://${getLocalIP()}:${port}`);
      resolve();
    });
    server.on('error', reject);
  });
}

function managementHTML(port) {
  const ip = getLocalIP();
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Kiosk Management</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f5f5f5; color: #333; padding: 20px; max-width: 800px; margin: 0 auto; }
  h1 { margin-bottom: 4px; }
  .address { font-size: 18px; color: #666; margin-bottom: 24px; font-family: monospace; background: #e8e8e8; display: inline-block; padding: 6px 14px; border-radius: 6px; }
  h2 { margin-top: 32px; margin-bottom: 12px; border-bottom: 2px solid #ddd; padding-bottom: 6px; }
  .note-card { background: #fff; border: 1px solid #ddd; border-radius: 8px; padding: 16px; margin-bottom: 12px; }
  .note-card input, .note-card textarea { width: 100%; border: 1px solid #ccc; border-radius: 4px; padding: 8px; font-size: 14px; font-family: inherit; }
  .note-card textarea { min-height: 60px; resize: vertical; margin-top: 8px; }
  .note-card .actions { margin-top: 10px; display: flex; gap: 8px; }
  button { padding: 8px 16px; border: none; border-radius: 6px; cursor: pointer; font-size: 14px; }
  .btn-save { background: #2563eb; color: #fff; }
  .btn-save:hover { background: #1d4ed8; }
  .btn-delete { background: #dc2626; color: #fff; }
  .btn-delete:hover { background: #b91c1c; }
  .btn-add { background: #16a34a; color: #fff; margin-top: 8px; }
  .btn-add:hover { background: #15803d; }
  #new-note { background: #fff; border: 1px solid #ddd; border-radius: 8px; padding: 16px; }
  #new-note input, #new-note textarea { width: 100%; border: 1px solid #ccc; border-radius: 4px; padding: 8px; font-size: 14px; font-family: inherit; }
  #new-note textarea { min-height: 80px; resize: vertical; margin-top: 8px; }
  .config-section { background: #fff; border: 1px solid #ddd; border-radius: 8px; padding: 16px; }
  .config-section label { display: block; margin-top: 12px; font-weight: 600; }
  .config-section input { width: 100%; border: 1px solid #ccc; border-radius: 4px; padding: 8px; font-size: 14px; margin-top: 4px; }
  .status { padding: 8px 12px; border-radius: 6px; margin-top: 10px; font-size: 14px; display: none; }
  .status.success { display: block; background: #dcfce7; color: #166534; }
  .status.error { display: block; background: #fee2e2; color: #991b1b; }
</style>
</head>
<body>
<h1>Kiosk Management</h1>
<div class="address">${ip}:${port}</div>

<h2>Notes</h2>
<div id="notes-list"></div>

<h2>Add Note</h2>
<div id="new-note">
  <input type="text" id="new-title" placeholder="Title">
  <textarea id="new-body" placeholder="Body text"></textarea>
  <button class="btn-add" onclick="addNote()">Add Note</button>
</div>

<h2>Config</h2>
<div class="config-section">
  <label>Calendar Interval (seconds)</label>
  <input type="number" id="cfg-cal-interval" min="5">
  <label>Note Interval (seconds)</label>
  <input type="number" id="cfg-note-interval" min="5">
  <label>Calendar Embed URL</label>
  <input type="text" id="cfg-calendar">
  <button class="btn-save" style="margin-top:12px" onclick="saveConfig()">Save Config</button>
  <div id="config-status" class="status"></div>
</div>

<script>
async function loadNotes() {
  const res = await fetch('/api/notes');
  const notes = await res.json();
  const list = document.getElementById('notes-list');
  list.innerHTML = notes.map(n => \`
    <div class="note-card" data-id="\${n.id}">
      <input type="text" value="\${esc(n.title)}" class="note-title">
      <textarea class="note-body">\${esc(n.body)}</textarea>
      <div class="actions">
        <button class="btn-save" onclick="saveNote('\${n.id}', this)">Save</button>
        <button class="btn-delete" onclick="deleteNote('\${n.id}')">Delete</button>
      </div>
    </div>
  \`).join('');
}

function esc(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }

async function saveNote(id, btn) {
  const card = btn.closest('.note-card');
  const title = card.querySelector('.note-title').value;
  const body = card.querySelector('.note-body').value;
  await fetch('/api/notes/' + id, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, body })
  });
  loadNotes();
}

async function deleteNote(id) {
  if (!confirm('Delete this note?')) return;
  await fetch('/api/notes/' + id, { method: 'DELETE' });
  loadNotes();
}

async function addNote() {
  const title = document.getElementById('new-title').value.trim();
  const body = document.getElementById('new-body').value.trim();
  if (!title && !body) return;
  await fetch('/api/notes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, body })
  });
  document.getElementById('new-title').value = '';
  document.getElementById('new-body').value = '';
  loadNotes();
}

async function loadConfig() {
  const res = await fetch('/api/config');
  const cfg = await res.json();
  document.getElementById('cfg-cal-interval').value = cfg.calendarIntervalSeconds;
  document.getElementById('cfg-note-interval').value = cfg.noteIntervalSeconds;
  document.getElementById('cfg-calendar').value = cfg.calendarEmbedUrl;
}

async function saveConfig() {
  const el = document.getElementById('config-status');
  try {
    await fetch('/api/config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        calendarIntervalSeconds: Number(document.getElementById('cfg-cal-interval').value),
        noteIntervalSeconds: Number(document.getElementById('cfg-note-interval').value),
        calendarEmbedUrl: document.getElementById('cfg-calendar').value
      })
    });
    el.textContent = 'Config saved. Kiosk will pick up changes within 10 seconds.';
    el.className = 'status success';
  } catch (e) {
    el.textContent = 'Failed to save config.';
    el.className = 'status error';
  }
}

loadNotes();
loadConfig();
</script>
</body>
</html>`;
}

module.exports = { startServer };

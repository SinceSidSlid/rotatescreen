const express = require('express');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { execSync, spawn } = require('child_process');
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

    // Check for updates (git fetch + status)
    app.get('/api/update/check', (req, res) => {
      try {
        execSync('git fetch', { cwd: __dirname, timeout: 15000 });
        const status = execSync('git status -uno', { cwd: __dirname, timeout: 5000 }).toString();
        const behind = status.includes('behind');
        res.json({ updateAvailable: behind, status: status.trim() });
      } catch (e) {
        res.status(500).json({ error: e.message });
      }
    });

    // Pull updates and restart the app
    app.post('/api/update/apply', (req, res) => {
      try {
        execSync('git stash', { cwd: __dirname, timeout: 5000 });
        const pullResult = execSync('git pull', { cwd: __dirname, timeout: 30000 }).toString();
        try { execSync('git stash pop', { cwd: __dirname, timeout: 5000 }); } catch (e) { /* stash may be empty */ }
        execSync('npm install --production', { cwd: __dirname, timeout: 60000 });
        res.json({ success: true, output: pullResult.trim() });
        // Restart the app after a short delay to let the response send
        setTimeout(() => {
          process.exit(0);
        }, 1000);
      } catch (e) {
        res.status(500).json({ error: e.message });
      }
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
<link href="https://cdn.jsdelivr.net/npm/quill@2.0.3/dist/quill.snow.css" rel="stylesheet">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f5f5f5; color: #333; padding: 20px; max-width: 800px; margin: 0 auto; }
  h1 { margin-bottom: 4px; }
  .address { font-size: 18px; color: #666; margin-bottom: 24px; font-family: monospace; background: #e8e8e8; display: inline-block; padding: 6px 14px; border-radius: 6px; }
  h2 { margin-top: 32px; margin-bottom: 12px; border-bottom: 2px solid #ddd; padding-bottom: 6px; }
  .note-card { background: #fff; border: 1px solid #ddd; border-radius: 8px; padding: 16px; margin-bottom: 12px; }
  .note-card input { width: 100%; border: 1px solid #ccc; border-radius: 4px; padding: 8px; font-size: 14px; font-family: inherit; }
  .field-label { display: block; font-weight: 600; font-size: 14px; color: #555; margin-bottom: 4px; margin-top: 12px; }
  .field-label:first-child { margin-top: 0; }
  .note-card .editor-container { margin-top: 4px; }
  .note-card .ql-container { min-height: 60px; font-size: 14px; }
  .note-card .actions { margin-top: 10px; display: flex; gap: 8px; }
  button { padding: 8px 16px; border: none; border-radius: 6px; cursor: pointer; font-size: 14px; }
  .btn-save { background: #2563eb; color: #fff; }
  .btn-save:hover { background: #1d4ed8; }
  .btn-delete { background: #dc2626; color: #fff; }
  .btn-delete:hover { background: #b91c1c; }
  .btn-add { background: #16a34a; color: #fff; margin-top: 8px; }
  .btn-add:hover { background: #15803d; }
  #new-note { background: #fff; border: 1px solid #ddd; border-radius: 8px; padding: 16px; }
  #new-note input { width: 100%; border: 1px solid #ccc; border-radius: 4px; padding: 8px; font-size: 14px; font-family: inherit; }
  #new-note .editor-container { margin-top: 8px; }
  #new-note .ql-container { min-height: 80px; font-size: 14px; }
  .config-section { background: #fff; border: 1px solid #ddd; border-radius: 8px; padding: 16px; }
  .config-section label { display: block; margin-top: 12px; font-weight: 600; }
  .config-section input { width: 100%; border: 1px solid #ccc; border-radius: 4px; padding: 8px; font-size: 14px; margin-top: 4px; }
  .status { padding: 8px 12px; border-radius: 6px; margin-top: 10px; font-size: 14px; display: none; }
  .status.success { display: block; background: #dcfce7; color: #166534; }
  .status.error { display: block; background: #fee2e2; color: #991b1b; }
  .ql-picker.ql-header .ql-picker-label[data-value=""]::before,
  .ql-picker.ql-header .ql-picker-item[data-value=""]::before,
  .ql-picker.ql-header .ql-picker-label:not([data-value])::before,
  .ql-picker.ql-header .ql-picker-item:not([data-value])::before { content: 'Body' !important; }
</style>
</head>
<body>
<h1>Kiosk Management</h1>
<div class="address">${ip}:${port}</div>

<h2>Notes</h2>
<div id="notes-list"></div>

<h2>Add Note</h2>
<div id="new-note">
  <label class="field-label">Title</label>
  <div class="editor-container">
    <div id="new-title-editor"></div>
  </div>
  <label class="field-label">Body</label>
  <div class="editor-container">
    <div id="new-body-editor"></div>
  </div>
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

<h2>Updates</h2>
<div class="config-section">
  <p id="update-info" style="font-size:14px;color:#666;">Click below to check for updates.</p>
  <div style="display:flex;gap:8px;margin-top:12px;">
    <button class="btn-save" onclick="checkUpdate()">Check for Updates</button>
    <button class="btn-add" id="apply-btn" onclick="applyUpdate()" style="display:none;">Apply Update &amp; Restart</button>
  </div>
  <div id="update-status" class="status"></div>
</div>

<script src="https://cdn.jsdelivr.net/npm/quill@2.0.3/dist/quill.js"></script>
<script>
const quillToolbar = [
  [{ 'size': ['small', false, 'large', 'huge'] }],
  [{ 'header': [1, 2, 3, false] }],
  ['bold', 'italic', 'underline', 'strike'],
  [{ 'color': [] }, { 'background': [] }],
  [{ 'list': 'ordered'}, { 'list': 'bullet' }],
  [{ 'align': [] }],
  ['clean']
];

// Track Quill instances for existing notes
const noteTitleEditors = {};
const noteBodyEditors = {};

let newTitleEditor = new Quill('#new-title-editor', {
  theme: 'snow',
  modules: { toolbar: quillToolbar },
  placeholder: 'Title...'
});

let newBodyEditor = new Quill('#new-body-editor', {
  theme: 'snow',
  modules: { toolbar: quillToolbar },
  placeholder: 'Body text...'
});

async function loadNotes() {
  const res = await fetch('/api/notes');
  const notes = await res.json();
  const list = document.getElementById('notes-list');

  // Clear old editors
  Object.keys(noteTitleEditors).forEach(k => delete noteTitleEditors[k]);
  Object.keys(noteBodyEditors).forEach(k => delete noteBodyEditors[k]);

  list.innerHTML = notes.map(n => \`
    <div class="note-card" data-id="\${n.id}">
      <label class="field-label">Title</label>
      <div class="editor-container">
        <div class="note-title-editor" id="title-editor-\${n.id}"></div>
      </div>
      <label class="field-label">Body</label>
      <div class="editor-container">
        <div class="note-body-editor" id="body-editor-\${n.id}"></div>
      </div>
      <div class="actions">
        <button class="btn-save" onclick="saveNote('\${n.id}', this)">Save</button>
        <button class="btn-delete" onclick="deleteNote('\${n.id}')">Delete</button>
      </div>
    </div>
  \`).join('');

  // Initialize Quill for each note
  notes.forEach(n => {
    const titleEditor = new Quill('#title-editor-' + n.id, {
      theme: 'snow',
      modules: { toolbar: quillToolbar }
    });
    titleEditor.root.innerHTML = n.title;
    noteTitleEditors[n.id] = titleEditor;

    const bodyEditor = new Quill('#body-editor-' + n.id, {
      theme: 'snow',
      modules: { toolbar: quillToolbar }
    });
    bodyEditor.root.innerHTML = n.body;
    noteBodyEditors[n.id] = bodyEditor;
  });
}

function esc(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }

async function saveNote(id, btn) {
  const title = noteTitleEditors[id].root.innerHTML;
  const body = noteBodyEditors[id].root.innerHTML;
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
  const title = newTitleEditor.root.innerHTML;
  const body = newBodyEditor.root.innerHTML;
  const isEmpty = newTitleEditor.getText().trim() === '' && newBodyEditor.getText().trim() === '';
  if (isEmpty) return;
  await fetch('/api/notes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, body })
  });
  newTitleEditor.setText('');
  newBodyEditor.setText('');
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

async function checkUpdate() {
  const info = document.getElementById('update-info');
  const el = document.getElementById('update-status');
  const btn = document.getElementById('apply-btn');
  info.textContent = 'Checking...';
  el.className = 'status';
  btn.style.display = 'none';
  try {
    const res = await fetch('/api/update/check');
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    if (data.updateAvailable) {
      info.textContent = 'Update available!';
      btn.style.display = 'inline-block';
    } else {
      info.textContent = 'Already up to date.';
    }
  } catch (e) {
    info.textContent = 'Failed to check for updates.';
    el.textContent = e.message;
    el.className = 'status error';
  }
}

async function applyUpdate() {
  const info = document.getElementById('update-info');
  const el = document.getElementById('update-status');
  const btn = document.getElementById('apply-btn');
  info.textContent = 'Applying update...';
  btn.style.display = 'none';
  try {
    const res = await fetch('/api/update/apply', { method: 'POST' });
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    el.textContent = 'Update applied! App is restarting...';
    el.className = 'status success';
    // Poll until the server comes back
    setTimeout(function poll() {
      fetch('/api/config').then(() => location.reload()).catch(() => setTimeout(poll, 2000));
    }, 3000);
  } catch (e) {
    info.textContent = 'Update failed.';
    el.textContent = e.message;
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

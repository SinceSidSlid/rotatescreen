# Electron Kiosk

Fullscreen kiosk app that auto-rotates between a Google Calendar embed and sticky-note slides. Includes a web-based management UI accessible from any machine on the network.

## Setup from Scratch

### macOS

1. **Install Node.js** (if you don't have it):
   ```bash
   # Option A: Download the installer from https://nodejs.org (LTS recommended)

   # Option B: Install via Homebrew
   brew install node
   ```

2. **Verify installation:**
   ```bash
   node --version
   npm --version
   ```

3. **Clone and run:**
   ```bash
   git clone https://github.com/SinceSidSlid/rotatescreen.git
   cd rotatescreen
   npm install
   npm start
   ```

4. **Quit the kiosk:** Press **ESC** or **Cmd+Q**.

### Windows

1. **Install Node.js** (if you don't have it):
   - Download the **LTS** installer from [https://nodejs.org](https://nodejs.org)
   - Run the installer — keep all defaults, make sure **"Add to PATH"** is checked
   - Restart your terminal after installing

2. **Install Git** (if you don't have it):
   - Download from [https://git-scm.com/download/win](https://git-scm.com/download/win)
   - Run the installer — keep defaults

3. **Verify installation** (open Command Prompt or PowerShell):
   ```cmd
   node --version
   npm --version
   git --version
   ```

4. **Clone and run:**
   ```cmd
   git clone https://github.com/SinceSidSlid/rotatescreen.git
   cd rotatescreen
   npm install
   npm start
   ```

5. **Quit the kiosk:** Press **ESC**.

## Development Mode

Run in a resizable window with DevTools:

```bash
npm run dev
```

## Standalone Management Server

Run the management server without the kiosk window (useful for managing notes before launching the kiosk):

```bash
npm run server
```

## Management UI

Once the app (or standalone server) is running, open a browser on any device on the same network:

```
http://<kiosk-ip>:3000
```

From there you can add/edit/delete notes and change rotation intervals and the calendar URL.

### Finding the kiosk machine's local IP

**macOS:**
```bash
ipconfig getifaddr en0
```

**Windows** (Command Prompt):
```cmd
ipconfig
```
Look for the **IPv4 Address** under your active network adapter (Wi-Fi or Ethernet).

The management UI also displays the IP and port at the top of the page.

## Google Calendar Embed URL

1. Open [Google Calendar](https://calendar.google.com) in a browser
2. Click the gear icon → **Settings**
3. Under **Settings for my calendars**, click the calendar you want to display
4. Scroll to **Integrate calendar**
5. Copy the **Embed code** — extract the URL from the `src="..."` attribute of the `<iframe>` tag
6. Paste that URL into the config via the management UI, or edit `config.json` directly

## Configuration

Edit `config.json` or use the management UI:

| Field | Default | Description |
|---|---|---|
| `calendarIntervalSeconds` | `30` | Seconds the calendar slide is displayed |
| `noteIntervalSeconds` | `10` | Seconds each note slide is displayed |
| `calendarEmbedUrl` | — | Google Calendar embed URL |
| `port` | `3000` | Port for the management server |

## Firewall

Port 3000 (or your configured port) must be accessible on the local network for remote management.

**macOS:** System Settings → Network → Firewall — add an exception for the Electron app, or temporarily disable the firewall for setup.

**Windows:** The first time you run the app, Windows Firewall will prompt you to allow access. Click **Allow access**. If you missed the prompt: Settings → Windows Security → Firewall & network protection → Allow an app through firewall.

## Project Structure

```
├── main.js               # Electron main process
├── preload.js             # Context bridge for renderer
├── server.js              # Express API + management UI
├── server-standalone.js   # Run server without Electron
├── config.json            # Rotation and calendar config
├── notes.json             # Stored notes
├── renderer/
│   ├── index.html         # Kiosk display
│   ├── app.js             # Slide rotation logic
│   └── styles.css         # Kiosk styles
└── package.json
```

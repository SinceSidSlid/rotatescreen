# Electron Kiosk

Fullscreen kiosk app that auto-rotates between a Google Calendar embed and sticky-note slides. Includes a web-based management UI accessible from any machine on the network.

## Quick Start

```bash
npm install
npm start
```

The kiosk launches fullscreen. Press **ESC** or **Cmd+Q** to quit.

## Management UI

Once running, open a browser on any device on the same network and go to:

```
http://<kiosk-ip>:3000
```

From there you can add/edit/delete notes and change the rotation interval and calendar URL.

### Finding the kiosk machine's local IP

**macOS:**
```bash
ipconfig getifaddr en0
```

**Linux:**
```bash
hostname -I | awk '{print $1}'
```

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
| `rotationIntervalSeconds` | `30` | Seconds each slide is displayed |
| `calendarEmbedUrl` | — | Google Calendar embed URL |
| `port` | `3000` | Port for the management server |

## Firewall

Port 3000 (or your configured port) must be accessible on the local network. On macOS:

**System Settings → Network → Firewall** — add an exception for the Electron app, or temporarily disable the firewall for setup.

## Project Structure

```
├── main.js          # Electron main process
├── preload.js       # Context bridge for renderer
├── server.js        # Express API + management UI
├── config.json      # Rotation and calendar config
├── notes.json       # Stored notes
├── renderer/
│   ├── index.html   # Kiosk display
│   ├── app.js       # Slide rotation logic
│   └── styles.css   # Kiosk styles
└── package.json
```

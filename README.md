# WiFi Chat

Real-time chat application for devices connected to the same WiFi network. Built with Express, Socket.IO, and EJS.

## Features

- **Real-time messaging** — Instant message delivery via WebSockets (Socket.IO)
- **PIN authentication** — Simple PIN-based access (default: `1234`)
- **Admin role** — Separate admin PIN (`1500`) with ability to change the chat PIN at runtime
- **QR code sharing** — Generate a QR code with the chat URL for easy mobile access
- **8 color themes** — Green (default), Blue, Purple, Red, Orange, Pink, Cyan, and Light — saved per-device
- **Typing indicators** — See who is typing in real time
- **Online users list** — Live sidebar showing all connected users
- **Chat history** — New users receive message history on join
- **Mobile responsive** — Collapsible sidebar, optimized layout for phones
- **WSL support** — Automatic detection of WSL1/WSL2, shows correct LAN IP using `ipconfig.exe`
- **Network info panel** — In-app instructions for port forwarding and firewall setup
- **Favicon** — Custom app icon
- **404 page** — Themed wildcard catch-all page

## Prerequisites

- Node.js 20+ (tested on v24)

## Quick Start

```bash
# Install dependencies
npm install

# Start the server
npm start

# Or with auto-reload (development)
npm run dev
```

Open `http://localhost:3000` in your browser.

## Accessing from Other Devices

### Same network (non-WSL)

Open `http://<your-ip>:3000` on any device connected to the same WiFi.

### WSL1

WSL1 shares the Windows network stack, so other devices can connect using your Windows IP directly. You may need to add a Windows Firewall rule:

```powershell
# Run in PowerShell as Administrator
netsh advfirewall firewall add rule name="WiFiChat" dir=in action=allow protocol=TCP localport=3000
```

### WSL2

WSL2 runs in a VM with its own network. You need port forwarding:

**Option A — Use the included scripts:**

```powershell
# Double-click setup-port-forward.bat
# Or run in PowerShell as Administrator:
powershell -ExecutionPolicy Bypass -File setup-port-forward.ps1
```

To remove forwarding later:

```powershell
powershell -ExecutionPolicy Bypass -File setup-port-forward.ps1 -Remove
```

**Option B — Manual setup:**

```powershell
# Get WSL IP
wsl hostname -I

# Forward port (replace <WSL_IP>)
netsh interface portproxy add v4tov4 listenport=3000 listenaddress=0.0.0.0 connectport=3000 connectaddress=<WSL_IP>

# Add firewall rule
netsh advfirewall firewall add rule name="WiFiChat" dir=in action=allow protocol=TCP localport=3000
```

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | Server port |
| `CHAT_PIN` | `1234` | PIN for user login |
| `ADMIN_PIN` | `1500` | PIN for admin login |

Set via environment variables:

```bash
PORT=8080 CHAT_PIN=9999 ADMIN_PIN=0000 npm start
```

## Project Structure

```
wifi-chat/
├── app.js                      # Express + Socket.IO server
├── package.json
├── setup-port-forward.ps1      # WSL2 port forwarding (PowerShell)
├── setup-port-forward.bat      # WSL2 port forwarding (double-click)
├── public/
│   ├── favicon.ico
│   ├── css/style.css           # Themes & all styles
│   └── js/chat.js              # Client-side chat logic
└── views/
    ├── login.ejs               # Login page with QR code
    ├── chat.ejs                # Chat interface
    └── 404.ejs                 # Not found page
```

## Tech Stack

- **Express** — Web server
- **Socket.IO** — Real-time WebSocket communication
- **EJS** — Server-side templates
- **express-session** — Session-based authentication
- **qrcode** — Server-side QR code generation
- **nodemon** — Development auto-restart

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const session = require('express-session');
const path = require('path');
const os = require('os');
const fs = require('fs');
const crypto = require('crypto');
const { execSync } = require('child_process');
const QRCode = require('qrcode');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// ── Config ──────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
let chatPin = process.env.CHAT_PIN || '1234';
const ADMIN_PIN = process.env.ADMIN_PIN || '1500';

// ── Network detection (WSL-aware, from reference app) ───────────────
const _isWSL = (() => {
  try {
    const release = os.release().toLowerCase();
    if (release.includes('microsoft') || release.includes('wsl')) return true;
    const proc = fs.readFileSync('/proc/version', 'utf8').toLowerCase();
    return proc.includes('microsoft') || proc.includes('wsl');
  } catch { return false; }
})();

const _isWSL2 = (() => {
  if (!_isWSL) return false;
  try {
    const release = os.release().toLowerCase();
    return release.includes('wsl2') || release.includes('microsoft-standard');
  } catch { return false; }
})();

function getWSLIP() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) return iface.address;
    }
  }
  return '127.0.0.1';
}

function getWindowsIP() {
  try {
    const output = execSync('ipconfig.exe', { timeout: 5000 }).toString();
    const lines = output.split('\n');
    let inRelevantAdapter = false;
    for (const line of lines) {
      if (/adapter/i.test(line)) {
        const isVirtual = /vEthernet|WSL|Docker|Loopback|Hyper-V|VPN|Bluetooth/i.test(line);
        const isPhysical = /Wi-?Fi|Wireless|Ethernet/i.test(line);
        inRelevantAdapter = isPhysical && !isVirtual;
      }
      if (inRelevantAdapter) {
        const match = line.match(/IPv4.*?:\s*(\d+\.\d+\.\d+\.\d+)/);
        if (match) return match[1];
      }
    }
  } catch { /* ignore */ }
  try {
    const resolv = fs.readFileSync('/etc/resolv.conf', 'utf8');
    const match = resolv.match(/nameserver\s+(\d+\.\d+\.\d+\.\d+)/);
    if (match) return match[1];
  } catch { /* ignore */ }
  return null;
}

function getLocalIP() {
  if (_isWSL) return getWindowsIP() || getWSLIP();
  return getWSLIP();
}

function wslToWindowsPath(linuxPath) {
  const match = linuxPath.match(/^\/mnt\/([a-zA-Z])\/(.*)$/);
  if (match) return `${match[1].toUpperCase()}:\\${match[2].replace(/\//g, '\\')}`;
  return linuxPath;
}

function getChatURL() {
  return `http://${getLocalIP()}:${PORT}`;
}

function getNetworkInfo() {
  return {
    lanIP: getLocalIP(),
    wslIP: _isWSL ? getWSLIP() : null,
    isWSL: _isWSL,
    isWSL2: _isWSL2,
    envLabel: _isWSL2 ? 'WSL2 (NAT)' : _isWSL ? 'WSL1 (Shared)' : 'Native',
    port: PORT,
  };
}

// ── Middleware ───────────────────────────────────────────────────────
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

const sessionMiddleware = session({
  secret: crypto.randomBytes(32).toString('hex'),
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 24 * 60 * 60 * 1000 }
});
app.use(sessionMiddleware);
io.engine.use(sessionMiddleware);

// ── In-memory store ─────────────────────────────────────────────────
const messages = [];
const onlineUsers = new Map();
const MAX_MESSAGES = 500;

// ── Auth middleware ──────────────────────────────────────────────────
function requireAuth(req, res, next) {
  if (req.session && req.session.authenticated) return next();
  res.redirect('/');
}

// ── Routes ──────────────────────────────────────────────────────────
app.get('/', (req, res) => {
  if (req.session && req.session.authenticated) return res.redirect('/chat');
  res.render('login', { error: null, success: null });
});

app.post('/login', (req, res) => {
  const { username, pin, role } = req.body;
  const trimmedName = (username || '').trim();
  if (!trimmedName || trimmedName.length < 1 || trimmedName.length > 20) {
    return res.render('login', { error: 'Username must be 1-20 characters.', success: null });
  }
  const isAdmin = role === 'admin';
  if (isAdmin) {
    if (pin !== ADMIN_PIN) return res.render('login', { error: 'Wrong Admin PIN.', success: null });
  } else {
    if (pin !== chatPin) return res.render('login', { error: 'Wrong PIN. Try again.', success: null });
  }
  req.session.authenticated = true;
  req.session.username = trimmedName;
  req.session.role = isAdmin ? 'admin' : 'user';
  res.redirect('/chat');
});

app.get('/chat', requireAuth, (req, res) => {
  res.render('chat', {
    username: req.session.username,
    role: req.session.role,
    networkInfo: getNetworkInfo()
  });
});

app.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/');
});

// ── QR code endpoint ────────────────────────────────────────────────
app.get('/qr', async (req, res) => {
  try {
    const url = getChatURL();
    const qr = await QRCode.toDataURL(url, { width: 280, margin: 2, color: { dark: '#000000', light: '#ffffff' } });
    res.json({ qr, url });
  } catch {
    res.status(500).json({ error: 'Failed to generate QR code' });
  }
});

// ── Network info API (for UI) ───────────────────────────────────────
app.get('/api/network-info', requireAuth, (req, res) => {
  res.json(getNetworkInfo());
});

// ── Socket.IO ───────────────────────────────────────────────────────
io.use((socket, next) => {
  const sess = socket.request.session;
  if (sess && sess.authenticated) next();
  else next(new Error('Unauthorized'));
});

io.on('connection', (socket) => {
  const sess = socket.request.session;
  const username = sess.username;
  const role = sess.role || 'user';
  onlineUsers.set(socket.id, { username, role });

  socket.emit('chat-history', messages);
  socket.emit('your-role', role);
  broadcastUsers();

  socket.broadcast.emit('system-message', {
    text: `${username} joined the chat`,
    time: timestamp()
  });

  socket.on('send-message', (text) => {
    if (typeof text !== 'string') return;
    const sanitized = text.trim().slice(0, 1000);
    if (!sanitized) return;
    const msg = { username, text: sanitized, time: timestamp() };
    messages.push(msg);
    if (messages.length > MAX_MESSAGES) messages.shift();
    io.emit('new-message', msg);
  });

  socket.on('change-pin', (newPin) => {
    const user = onlineUsers.get(socket.id);
    if (!user || user.role !== 'admin') return;
    if (typeof newPin !== 'string') return;
    const trimmed = newPin.trim();
    if (trimmed.length < 1 || trimmed.length > 10) return;
    chatPin = trimmed;
    socket.emit('pin-changed', trimmed);
    io.emit('system-message', { text: `Room PIN was changed by ${username}`, time: timestamp() });
    console.log(`  [Admin] PIN changed to: ${trimmed}`);
  });

  socket.on('typing', () => socket.broadcast.emit('user-typing', username));
  socket.on('stop-typing', () => socket.broadcast.emit('user-stop-typing', username));

  socket.on('disconnect', () => {
    onlineUsers.delete(socket.id);
    broadcastUsers();
    socket.broadcast.emit('system-message', { text: `${username} left the chat`, time: timestamp() });
  });
});

function broadcastUsers() {
  const users = [...new Set([...onlineUsers.values()].map(u => u.username))];
  io.emit('online-users', users);
}

function timestamp() {
  return new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
}

// ── Wildcard 404 ────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).render('404');
});

// ── Start ───────────────────────────────────────────────────────────
server.listen(PORT, '0.0.0.0', () => {
  const lanIP = getLocalIP();
  const wslIP = _isWSL ? getWSLIP() : null;

  console.log('');
  console.log('  ╔══════════════════════════════════════════════════╗');
  console.log('  ║            WiFi Chat is running!                 ║');
  console.log('  ╠══════════════════════════════════════════════════╣');
  console.log(`  ║  Web UI:     http://${lanIP}:${PORT}`);
  console.log(`  ║  Chat PIN:   ${chatPin}`);
  console.log(`  ║  Admin PIN:  ${ADMIN_PIN}`);
  console.log('  ╚══════════════════════════════════════════════════╝');

  if (_isWSL) {
    console.log('');
    if (_isWSL2) {
      console.log('  ⚠  WSL2 detected (NAT mode — port forwarding required)');
      console.log(`  ║  WSL internal IP : ${wslIP}`);
      console.log(`  ║  Windows LAN IP  : ${lanIP}`);
      console.log('  ║');
      console.log('  ║  Run in Admin PowerShell (one-time):');
      const winScript = wslToWindowsPath(path.resolve(__dirname, 'setup-port-forward.ps1'));
      console.log(`  ║  powershell -ExecutionPolicy Bypass -File "${winScript}"`);
      console.log('  ║');
      console.log('  ║  Or manual:');
      console.log(`  ║  netsh interface portproxy add v4tov4 listenport=${PORT} listenaddress=0.0.0.0 connectport=${PORT} connectaddress=${wslIP}`);
      console.log(`  ║  netsh advfirewall firewall add rule name="WiFiChat" dir=in action=allow protocol=TCP localport=${PORT}`);
    } else {
      console.log('  ℹ  WSL1 detected (shared network — no port forwarding needed)');
      console.log(`  ║  LAN IP : ${lanIP}`);
      console.log('  ║');
      console.log('  ║  If phone cannot connect, open Admin PowerShell and run:');
      console.log(`  ║  netsh advfirewall firewall add rule name="WiFiChat" dir=in action=allow protocol=TCP localport=${PORT}`);
      console.log('  ║  This allows incoming connections through Windows Firewall.');
    }
  }

  console.log('');
  console.log('  Share the URL with devices on your WiFi!');
  console.log('');
});

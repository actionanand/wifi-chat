const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const session = require('express-session');
const os = require('os');
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

// ── Middleware ───────────────────────────────────────────────────────
app.set('view engine', 'ejs');
app.set('views', __dirname + '/views');
app.use(express.static(__dirname + '/public'));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

const sessionMiddleware = session({
  secret: crypto.randomBytes(32).toString('hex'),
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 24 * 60 * 60 * 1000 } // 1 day
});
app.use(sessionMiddleware);

// Share session with Socket.IO
io.engine.use(sessionMiddleware);

// ── In-memory store ─────────────────────────────────────────────────
const messages = [];      // { username, text, time }
const onlineUsers = new Map(); // socketId -> { username, role }
const MAX_MESSAGES = 500; // rolling history

// ── Auth middleware ──────────────────────────────────────────────────
function requireAuth(req, res, next) {
  if (req.session && req.session.authenticated) return next();
  res.redirect('/');
}

// ── Routes ──────────────────────────────────────────────────────────
app.get('/', (req, res) => {
  if (req.session && req.session.authenticated) {
    return res.redirect('/chat');
  }
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
    if (pin !== ADMIN_PIN) {
      return res.render('login', { error: 'Wrong Admin PIN.', success: null });
    }
  } else {
    if (pin !== chatPin) {
      return res.render('login', { error: 'Wrong PIN. Try again.', success: null });
    }
  }

  req.session.authenticated = true;
  req.session.username = trimmedName;
  req.session.role = isAdmin ? 'admin' : 'user';
  res.redirect('/chat');
});

app.get('/chat', requireAuth, (req, res) => {
  res.render('chat', {
    username: req.session.username,
    role: req.session.role
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
    const qrDataURL = await QRCode.toDataURL(url, {
      width: 280,
      margin: 2,
      color: { dark: '#000000', light: '#ffffff' }
    });
    res.json({ qr: qrDataURL, url });
  } catch {
    res.status(500).json({ error: 'Failed to generate QR code' });
  }
});

// ── Socket.IO ───────────────────────────────────────────────────────
io.use((socket, next) => {
  const sess = socket.request.session;
  if (sess && sess.authenticated) {
    next();
  } else {
    next(new Error('Unauthorized'));
  }
});

io.on('connection', (socket) => {
  const sess = socket.request.session;
  const username = sess.username;
  const role = sess.role || 'user';
  onlineUsers.set(socket.id, { username, role });

  // Send chat history & role to the new user
  socket.emit('chat-history', messages);
  socket.emit('your-role', role);

  // Broadcast updated user list
  broadcastUsers();

  // Notify others
  socket.broadcast.emit('system-message', {
    text: `${username} joined the chat`,
    time: timestamp()
  });

  // Handle incoming message
  socket.on('send-message', (text) => {
    if (typeof text !== 'string') return;
    const sanitized = text.trim().slice(0, 1000);
    if (!sanitized) return;

    const msg = { username, text: sanitized, time: timestamp() };
    messages.push(msg);
    if (messages.length > MAX_MESSAGES) messages.shift();

    io.emit('new-message', msg);
  });

  // Admin: change PIN
  socket.on('change-pin', (newPin) => {
    const user = onlineUsers.get(socket.id);
    if (!user || user.role !== 'admin') return;
    if (typeof newPin !== 'string') return;
    const trimmed = newPin.trim();
    if (trimmed.length < 1 || trimmed.length > 10) return;

    chatPin = trimmed;
    socket.emit('pin-changed', trimmed);
    io.emit('system-message', {
      text: `Room PIN was changed by ${username}`,
      time: timestamp()
    });
    console.log(`  [Admin] PIN changed to: ${trimmed}`);
  });

  // Typing indicator
  socket.on('typing', () => {
    socket.broadcast.emit('user-typing', username);
  });

  socket.on('stop-typing', () => {
    socket.broadcast.emit('user-stop-typing', username);
  });

  // Disconnect
  socket.on('disconnect', () => {
    onlineUsers.delete(socket.id);
    broadcastUsers();
    socket.broadcast.emit('system-message', {
      text: `${username} left the chat`,
      time: timestamp()
    });
  });
});

function broadcastUsers() {
  const users = [...onlineUsers.values()].map(u => u.username);
  const unique = [...new Set(users)];
  io.emit('online-users', unique);
}

function timestamp() {
  return new Date().toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  });
}

// ── Network IP detection (WSL-aware) ────────────────────────────────
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

function isWSL() {
  try {
    const release = os.release().toLowerCase();
    return release.includes('microsoft') || release.includes('wsl');
  } catch { return false; }
}

function getWindowsHostIP() {
  try {
    // WSL2: the default gateway is the Windows host
    const route = execSync('ip route show default 2>/dev/null', { encoding: 'utf8' });
    const match = route.match(/via\s+(\d+\.\d+\.\d+\.\d+)/);
    if (match) return match[1];
  } catch { /* ignore */ }
  try {
    // Fallback: /etc/resolv.conf nameserver (works in most WSL2 setups)
    const resolv = execSync('grep nameserver /etc/resolv.conf 2>/dev/null | head -1', { encoding: 'utf8' });
    const match = resolv.match(/(\d+\.\d+\.\d+\.\d+)/);
    if (match) return match[1];
  } catch { /* ignore */ }
  return null;
}

function getChatURL() {
  const ip = getLocalIP();
  return `http://${ip}:${PORT}`;
}

// ── Wildcard 404 ────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).render('404');
});

// ── Start ───────────────────────────────────────────────────────────
server.listen(PORT, '0.0.0.0', () => {
  const ip = getLocalIP();
  const wsl = isWSL();
  const winIP = wsl ? getWindowsHostIP() : null;

  console.log('');
  console.log('  ╔══════════════════════════════════════════════════╗');
  console.log('  ║            WiFi Chat is running                  ║');
  console.log('  ╠══════════════════════════════════════════════════╣');
  console.log(`  ║  Local:      http://localhost:${PORT}               ║`);
  console.log(`  ║  WSL IP:     http://${ip}:${PORT}         ║`);
  console.log(`  ║  Chat PIN:   ${chatPin}                                ║`);
  console.log(`  ║  Admin PIN:  ${ADMIN_PIN}                                ║`);
  console.log('  ╚══════════════════════════════════════════════════╝');

  if (wsl) {
    console.log('');
    console.log('  ⚠  WSL detected! Other devices on WiFi cannot reach the WSL IP.');
    console.log('  ➜  Run this in Windows PowerShell (as Admin) to forward the port:');
    console.log('');
    console.log(`     netsh interface portproxy add v4tov4 listenport=${PORT} listenaddress=0.0.0.0 connectport=${PORT} connectaddress=${ip}`);
    console.log('');
    console.log('     Then allow it through Windows Firewall:');
    console.log(`     netsh advfirewall firewall add rule name="WiFi Chat" dir=in action=allow protocol=tcp localport=${PORT}`);
    console.log('');
    if (winIP) {
      console.log(`  ➜  After port forwarding, use your Windows IP to connect.`);
      console.log(`     Find it with: ipconfig (look for "Wi-Fi" adapter IPv4)`);
    }
  }

  console.log('');
  console.log('  Share the URL with devices on your WiFi!');
  console.log('');
});

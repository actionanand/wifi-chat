(() => {
  'use strict';

  const socket = io();

  // DOM refs
  const messagesEl    = document.getElementById('messages');
  const messagesArea  = document.getElementById('messages-area');
  const form          = document.getElementById('message-form');
  const input         = document.getElementById('message-input');
  const typingEl      = document.getElementById('typing-indicator');
  const userListEl    = document.getElementById('user-list');
  const userCountEl   = document.getElementById('user-count');
  const sidebar       = document.getElementById('sidebar');
  const btnMenu       = document.getElementById('btn-menu');

  let typingTimeout = null;
  let isTyping = false;

  // �── Theme ───────────────────────────────────────────────────────
  const savedTheme = localStorage.getItem('wifi-chat-theme') || 'green';
  document.body.setAttribute('data-theme', savedTheme);

  function setActiveThemeSwatch() {
    const current = document.body.getAttribute('data-theme');
    document.querySelectorAll('.theme-swatch').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.theme === current);
    });
  }

  document.getElementById('theme-picker').addEventListener('click', (e) => {
    const swatch = e.target.closest('.theme-swatch');
    if (!swatch) return;
    const theme = swatch.dataset.theme;
    document.body.setAttribute('data-theme', theme);
    localStorage.setItem('wifi-chat-theme', theme);
    setActiveThemeSwatch();
  });

  setActiveThemeSwatch();

  // ── Admin Panel ─────────────────────────────────────────────────
  if (MY_ROLE === 'admin') {
    const adminPanel = document.getElementById('admin-panel');
    if (adminPanel) adminPanel.style.display = '';

    const btnChangePin = document.getElementById('btn-change-pin');
    const newPinInput  = document.getElementById('new-pin-input');
    const pinStatus    = document.getElementById('pin-status');

    btnChangePin.addEventListener('click', () => {
      const newPin = newPinInput.value.trim();
      if (!newPin || newPin.length < 1 || newPin.length > 10) {
        pinStatus.textContent = 'PIN must be 1-10 characters.';
        return;
      }
      socket.emit('change-pin', newPin);
      newPinInput.value = '';
    });

    newPinInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        btnChangePin.click();
      }
    });

    socket.on('pin-changed', (pin) => {
      pinStatus.textContent = 'PIN changed to: ' + pin;
      setTimeout(() => { pinStatus.textContent = ''; }, 4000);
    });
  }

  // ── QR Code (sidebar) ──────────────────────────────────────────
  const btnQr = document.getElementById('btn-qr-sidebar');
  const qrBox = document.getElementById('qr-sidebar-box');

  btnQr.addEventListener('click', async () => {
    if (qrBox.style.display !== 'none') {
      qrBox.style.display = 'none';
      btnQr.textContent = 'Show QR Code';
      return;
    }
    try {
      const res = await fetch('/qr');
      const data = await res.json();
      document.getElementById('qr-sidebar-img').src = data.qr;
      document.getElementById('qr-sidebar-url').textContent = data.url;
      qrBox.style.display = 'block';
      btnQr.textContent = 'Hide QR Code';
    } catch { /* ignore */ }
  });

  // ── Helpers ─────────────────────────────────────────────────────
  function escapeHTML(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function scrollToBottom() {
    messagesArea.scrollTop = messagesArea.scrollHeight;
  }

  function createMessageEl(msg) {
    const isSelf = msg.username === MY_USERNAME;
    const div = document.createElement('div')
    div.className = 'msg ' + (isSelf ? 'msg-self' : 'msg-other');

    let html = '';
    if (!isSelf) {
      html += '<div class="msg-author">' + escapeHTML(msg.username) + '</div>';
    }
    html += '<div class="msg-text">' + escapeHTML(msg.text) + '</div>';
    html += '<div class="msg-time">' + escapeHTML(msg.time) + '</div>';
    div.innerHTML = html;
    return div;
  }

  function createSystemEl(msg) {
    const div = document.createElement('div');
    div.className = 'msg-system';
    div.textContent = msg.text + ' \u00b7 ' + msg.time;
    return div;
  }

  // ── Chat history ────────────────────────────────────────────────
  socket.on('chat-history', (history) => {
    messagesEl.innerHTML = '';
    history.forEach((msg) => {
      messagesEl.appendChild(createMessageEl(msg));
    });
    scrollToBottom();
  });

  // ── New message ──────────────────────────────────────
  socket.on('new-message', (msg) => {
    messagesEl.appendChild(createMessageEl(msg));
    scrollToBottom();

    if (document.hidden && msg.us

    }
  });

  // �── System message ──────────────────────────────────────
  socket.on('system-message', (msg) => {
    messagesEl.appendChild(createSystemEl(msg));
  
  });

  // �── Online users ───────────────
  sock
    userCountEl.textContent = users.length;
    userListEl.innerHTML = '';
    users.sort().forEach((u) => {
      const li = document.createElement('li');
      li.textContent = u;
      if (u === MY_USERNAME) li.style.fontWei
      userListEl.appendChild(li);
    });
  });

  // �── Typing ──────────────────────────────────────
  const typingUsers = new Set();

  socket.on('user-typing', (username) => {
    typingUsers.add(username);
    renderTyping();
  

  socket.on('user-stop-typing', (username) => {
  
    renderTyping();
  });

  function renderTyping() {
    if (typingUsers.size === 0) {
      typingEl.textCo
    } else if (typingUsers.size === 1) {
      typingEl.textContent = [...typingUsers][0] + ' is typing\u2026';
    } else {
      typingEl.textContent = typingUsers.size + ' people are typing\u2026';
    }
  }

  // ── Send message ────
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text) return;

    socket.emit('send-message', text);
    input.value = '';
    input.focus();

    if (isTyping) {
      socket.emit('stop-typing');
      isTyping = false;
    }
  });

  // �── Typing events ──────────────────────────────────────────────
  input.addEventListener('input', () => {
    if (!isTypi
      isTyping = true;
      socket.emit('typing');
    }
    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => {
      isTyping = false;
      socket.emit('stop-typing');
    }, 1500);
  });

  // ── Reset title on
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      document.title = 'WiFi Chat';
    }
  });

  // ── Mobile sidebar toggle ──────────────────────────────────────
  le
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.className = 'sidebar-overlay';
    document.body.appendChild(overlay);
  }

  btnMenu.addEventListener('
    sidebar.classList.toggle('open');
    overlay.classList.toggle('active');
  });

  overlay.addEventListener('click', () => {
    
    overlay.classList.remove('active');
  });

  // ── Reconnection ───────────────────────────────────────────────
  soc
    messagesEl.appendChild(createSystemEl({
      text: 'Connectio
      time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })
    }));
    scrol
  });

  socket.on('connect', () => {
    if (messagesEl.children.length > 0) {
      messagesEl.appendChild(createSystemEl({
        text: 'Reconnected!',
        time: new Date().toLocaleT
      }));
      scrollToBottom();
    }
  });
})();

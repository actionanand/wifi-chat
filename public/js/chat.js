(() => {
  'use strict';

  var socket = io();

  // DOM refs
  var messagesEl   = document.getElementById('messages');
  var messagesArea = document.getElementById('messages-area');
  var form         = document.getElementById('message-form');
  var input        = document.getElementById('message-input');
  var typingEl     = document.getElementById('typing-indicator');
  var userListEl   = document.getElementById('user-list');
  var userCountEl  = document.getElementById('user-count');
  var sidebar      = document.getElementById('sidebar');
  var btnMenu      = document.getElementById('btn-menu');

  var typingTimeout = null;
  var isTyping = false;

  // ── Theme ──────────────────────────────────────────────────────
  var savedTheme = localStorage.getItem('wifi-chat-theme') || 'green';
  document.body.setAttribute('data-theme', savedTheme);

  function setActiveThemeSwatch() {
    var current = document.body.getAttribute('data-theme');
    document.querySelectorAll('.theme-swatch').forEach(function(btn) {
      btn.classList.toggle('active', btn.dataset.theme === current);
    });
  }

  document.getElementById('theme-picker').addEventListener('click', function(e) {
    var swatch = e.target.closest('.theme-swatch');
    if (!swatch) return;
    var theme = swatch.dataset.theme;
    document.body.setAttribute('data-theme', theme);
    localStorage.setItem('wifi-chat-theme', theme);
    setActiveThemeSwatch();
  });

  setActiveThemeSwatch();

  // ── Admin Panel ────────────────────────────────────────────────
  if (MY_ROLE === 'admin') {
    var adminPanel = document.getElementById('admin-panel');
    if (adminPanel) adminPanel.style.display = '';

    var btnChangePin = document.getElementById('btn-change-pin');
    var newPinInput  = document.getElementById('new-pin-input');
    var pinStatus    = document.getElementById('pin-status');

    btnChangePin.addEventListener('click', function() {
      var newPin = newPinInput.value.trim();
      if (!newPin || newPin.length < 1 || newPin.length > 10) {
        pinStatus.textContent = 'PIN must be 1-10 characters.';
        return;
      }
      socket.emit('change-pin', newPin);
      newPinInput.value = '';
    });

    newPinInput.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        btnChangePin.click();
      }
    });

    socket.on('pin-changed', function(pin) {
      pinStatus.textContent = 'PIN changed to: ' + pin;
      setTimeout(function() { pinStatus.textContent = ''; }, 4000);
    });
  }

  // ── QR Code (sidebar) ─────────────────────────────────────────
  var btnQr = document.getElementById('btn-qr-sidebar');
  var qrBox = document.getElementById('qr-sidebar-box');

  btnQr.addEventListener('click', function() {
    if (qrBox.style.display !== 'none') {
      qrBox.style.display = 'none';
      btnQr.textContent = 'Show QR Code';
      return;
    }
    fetch('/qr').then(function(res) { return res.json(); }).then(function(data) {
      document.getElementById('qr-sidebar-img').src = data.qr;
      document.getElementById('qr-sidebar-url').textContent = data.url;
      qrBox.style.display = 'block';
      btnQr.textContent = 'Hide QR Code';
    }).catch(function() {});
  });

  // ── Helpers ────────────────────────────────────────────────────
  function escapeHTML(str) {
    var div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function scrollToBottom() {
    messagesArea.scrollTop = messagesArea.scrollHeight;
  }

  function createMessageEl(msg) {
    var isSelf = msg.username === MY_USERNAME;
    var div = document.createElement('div');
    div.className = 'msg ' + (isSelf ? 'msg-self' : 'msg-other');
    var html = '';
    if (!isSelf) {
      html += '<div class="msg-author">' + escapeHTML(msg.username) + '</div>';
    }
    html += '<div class="msg-text">' + escapeHTML(msg.text) + '</div>';
    html += '<div class="msg-time">' + escapeHTML(msg.time) + '</div>';
    div.innerHTML = html;
    return div;
  }

  function createSystemEl(msg) {
    var div = document.createElement('div');
    div.className = 'msg-system';
    div.textContent = msg.text + ' \u00b7 ' + msg.time;
    return div;
  }

  // ── Chat history ───────────────────────────────────────────────
  socket.on('chat-history', function(history) {
    messagesEl.innerHTML = '';
    history.forEach(function(msg) {
      messagesEl.appendChild(createMessageEl(msg));
    });
    scrollToBottom();
  });

  // ── New message ────────────────────────────────────────────────
  socket.on('new-message', function(msg) {
    messagesEl.appendChild(createMessageEl(msg));
    scrollToBottom();
    if (document.hidden && msg.username !== MY_USERNAME) {
      document.title = '(New) WiFi Chat';
    }
  });

  // ── System message ─────────────────────────────────────────────
  socket.on('system-message', function(msg) {
    messagesEl.appendChild(createSystemEl(msg));
    scrollToBottom();
  });

  // ── Online users ───────────────────────────────────────────────
  socket.on('online-users', function(users) {
    userCountEl.textContent = users.length;
    userListEl.innerHTML = '';
    users.sort().forEach(function(u) {
      var li = document.createElement('li');
      li.textContent = u;
      if (u === MY_USERNAME) li.style.fontWeight = '600';
      userListEl.appendChild(li);
    });
  });

  // ── Typing ─────────────────────────────────────────────────────
  var typingUsers = new Set();

  socket.on('user-typing', function(username) {
    typingUsers.add(username);
    renderTyping();
  });

  socket.on('user-stop-typing', function(username) {
    typingUsers.delete(username);
    renderTyping();
  });

  function renderTyping() {
    if (typingUsers.size === 0) {
      typingEl.textContent = '';
    } else if (typingUsers.size === 1) {
      typingEl.textContent = Array.from(typingUsers)[0] + ' is typing\u2026';
    } else {
      typingEl.textContent = typingUsers.size + ' people are typing\u2026';
    }
  }

  // ── Send message ───────────────────────────────────────────────
  form.addEventListener('submit', function(e) {
    e.preventDefault();
    var text = input.value.trim();
    if (!text) return;
    socket.emit('send-message', text);
    input.value = '';
    input.focus();
    if (isTyping) {
      socket.emit('stop-typing');
      isTyping = false;
    }
  });

  // ── Typing events ──────────────────────────────────────────────
  input.addEventListener('input', function() {
    if (!isTyping) {
      isTyping = true;
      socket.emit('typing');
    }
    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(function() {
      isTyping = false;
      socket.emit('stop-typing');
    }, 1500);
  });

  // ── Reset title on focus ───────────────────────────────────────
  document.addEventListener('visibilitychange', function() {
    if (!document.hidden) {
      document.title = 'WiFi Chat';
    }
  });

  // ── Mobile sidebar toggle ──────────────────────────────────────
  var overlay = document.querySelector('.sidebar-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.className = 'sidebar-overlay';
    document.body.appendChild(overlay);
  }

  btnMenu.addEventListener('click', function() {
    sidebar.classList.toggle('open');
    overlay.classList.toggle('active');
  });

  overlay.addEventListener('click', function() {
    sidebar.classList.remove('open');
    overlay.classList.remove('active');
  });

  // ── Reconnection ──────────────────────────────────────────────
  socket.on('disconnect', function() {
    messagesEl.appendChild(createSystemEl({
      text: 'Connection lost. Reconnecting...',
      time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })
    }));
    scrollToBottom();
  });

  socket.on('connect', function() {
    if (messagesEl.children.length > 0) {
      messagesEl.appendChild(createSystemEl({
        text: 'Reconnected!',
        time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })
      }));
      scrollToBottom();
    }
  });
})();

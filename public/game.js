/* ═══════════════════════════════════════
   SERVER WARS — Client Logic
   ═══════════════════════════════════════ */

const socket = io();

let myPlayerId  = null;
let myLobbyId   = null;
let gameState   = null;  // sanitized lobby
let isHost      = false;
let cmdHistory  = [];
let cmdHistIdx  = -1;

// Cooldown tracking (client-side visual only)
const cooldowns = {
  attack: { end: 0, duration: 3000, fillEl: null, timerEl: null },
  defend: { end: 0, duration: 5000, fillEl: null, timerEl: null }
};

// ── Helpers ──────────────────────────────────────────────────────

function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => {
    s.classList.remove('active');
    s.style.display = '';
  });
  const el = document.getElementById(id);
  el.classList.add('active');
  if (id === 'screen-game') el.style.display = 'grid';
}

function setError(msg) {
  const el = document.getElementById('home-error');
  el.textContent = msg;
  el.classList.remove('hidden');
  setTimeout(() => el.classList.add('hidden'), 4000);
}

function getTime() {
  return new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function healthClass(hp) {
  if (hp > 50) return 'high';
  if (hp > 25) return 'mid';
  return 'low';
}

function healthColor(hp) {
  if (hp > 50) return 'linear-gradient(90deg,#00cc66,#00ff88)';
  if (hp > 25) return 'linear-gradient(90deg,#cc8800,#ffaa00)';
  return 'linear-gradient(90deg,#cc0033,#ff2255)';
}

function myPlayer() {
  return gameState?.players?.find(p => p.id === myPlayerId);
}

function getServerById(sid) {
  const card = document.querySelector(`.server-card[data-server="${sid}"]`);
  return card;
}

// ── LOG ──────────────────────────────────────────────────────────

function addLog(msg, cls = 'log-system') {
  const log = document.getElementById('event-log');
  const entry = document.createElement('div');
  entry.className = `log-entry ${cls}`;
  entry.innerHTML = `<span class="log-time">[${getTime()}]</span>${msg}`;
  log.appendChild(entry);
  log.scrollTop = log.scrollHeight;
}

// ── SERVER CARD RENDERING ─────────────────────────────────────────

function buildServerCard(server, isOwn) {
  const hp     = server.health;
  const isDead = hp <= 0;
  const hClass = isDead ? 'dead' : healthClass(hp);
  const sid    = server.name;

  const scene = document.createElement('div');
  scene.className = 'server-scene';

  const card = document.createElement('div');
  card.className = `server-card${isDead ? ' dead' : ''}`;
  card.dataset.server = sid;
  card.dataset.healthClass = hClass;

  card.innerHTML = `
    <div class="server-leds">
      <div class="led"></div>
      <div class="led"></div>
      <div class="led"></div>
    </div>
    <div class="server-drives">
      <div class="server-drive"></div>
      <div class="server-drive"></div>
      <div class="server-drive"></div>
    </div>
    <div class="server-name-tag">${sid}</div>
    <div class="server-health-wrap">
      <div class="server-health-bar-bg">
        <div class="server-health-bar" style="width:${hp}%; background:${healthColor(hp)}"></div>
      </div>
      <div class="server-health-text">${hp}%</div>
    </div>
  `;

  scene.appendChild(card);
  return scene;
}

function updateServerCard(card, server) {
  const hp = server.health;
  const isDead = hp <= 0;
  const hClass = isDead ? 'dead' : healthClass(hp);

  card.dataset.healthClass = hClass;

  const bar  = card.querySelector('.server-health-bar');
  const txt  = card.querySelector('.server-health-text');
  const leds = card.querySelectorAll('.led');

  if (bar) { bar.style.width = `${hp}%`; bar.style.background = healthColor(hp); }
  if (txt) txt.textContent = `${hp}%`;

  if (isDead && !card.classList.contains('dead')) {
    card.classList.add('dead');
    card.classList.remove('attacking', 'defending');
    leds.forEach(l => { l.style.background = '#330011'; l.style.boxShadow = 'none'; });
  }
}

function animateServer(serverName, type) {
  const card = document.querySelector(`.server-card[data-server="${serverName}"]`);
  if (!card || card.classList.contains('dead')) return;

  const cls   = type === 'attack' ? 'attacking' : 'defending';
  const other = type === 'attack' ? 'defending' : 'attacking';

  card.classList.remove(cls, other);
  void card.offsetWidth; // reflow
  card.classList.add(cls);

  // Floating popup
  const popup = document.createElement('div');
  popup.className = `float-popup ${type === 'attack' ? 'damage' : 'heal'}`;
  popup.textContent = type === 'attack' ? '-20%' : '+15%';
  card.appendChild(popup);

  setTimeout(() => {
    card.classList.remove(cls);
    popup.remove();
  }, type === 'attack' ? 700 : 800);
}

// ── RENDER MY SERVERS ─────────────────────────────────────────────

function renderMyServers() {
  const me = myPlayer();
  if (!me) return;

  const container = document.getElementById('my-servers');

  me.servers.forEach(server => {
    const existing = container.querySelector(`.server-card[data-server="${server.name}"]`);
    if (existing) {
      updateServerCard(existing, server);
    } else {
      container.appendChild(buildServerCard(server, true));
    }
  });
}

// ── RENDER OPPONENT SIDEBAR ────────────────────────────────────────

function renderSidebar() {
  if (!gameState) return;
  const container = document.getElementById('other-players');

  const others = gameState.players.filter(p => p.id !== myPlayerId);

  others.forEach(player => {
    let card = container.querySelector(`[data-player-id="${player.id}"]`);

    const eliminated = !player.servers.some(s => s.health > 0);

    if (!card) {
      card = document.createElement('div');
      card.className = 'opponent-card';
      card.dataset.playerId = player.id;
      container.appendChild(card);
    }

    if (eliminated) card.classList.add('eliminated');
    else card.classList.remove('eliminated');

    const serversHtml = player.servers.map(s => {
      const isDead = s.health <= 0;
      return `
        <div class="mini-server ${isDead ? 'dead' : ''}">
          <div class="mini-server-name" title="${s.name}">${s.name}</div>
          <div class="mini-health-bg">
            <div class="mini-health-fill" style="width:${s.health}%; background:${healthColor(s.health)}"></div>
          </div>
        </div>
      `;
    }).join('');

    card.innerHTML = `
      <div class="opponent-name">
        <span>${player.name}</span>
        ${eliminated ? '<span class="opponent-tag">✕ ÉLIMINÉ</span>' : ''}
      </div>
      ${serversHtml}
    `;
  });

  // Remove cards for players who left
  container.querySelectorAll('[data-player-id]').forEach(el => {
    if (!others.find(p => p.id === el.dataset.playerId)) el.remove();
  });
}

// ── COMMAND SUGGESTIONS ───────────────────────────────────────────

function updateSuggestions() {
  const input = document.getElementById('command-input');
  const box   = document.getElementById('suggestions');
  const val   = input.value.trim().toLowerCase();
  box.innerHTML = '';

  if (!gameState || !val) { box.classList.add('hidden'); return; }

  const parts = val.split(/\s+/);
  const cmd   = parts[0];
  const query = parts.slice(1).join('').toUpperCase();

  let pool = [];

  if ((cmd === 'attack' || cmd === 'a') && parts.length >= 1) {
    // Suggest enemy servers
    gameState.players
      .filter(p => p.id !== myPlayerId)
      .forEach(p => {
        p.servers.filter(s => s.health > 0 && s.name.startsWith(query))
          .forEach(s => pool.push({ name: s.name, hp: s.health, type: 'attack', owner: p.name }));
      });
  } else if ((cmd === 'defend' || cmd === 'd') && parts.length >= 1) {
    const me = myPlayer();
    if (me) {
      me.servers.filter(s => s.health > 0 && s.name.startsWith(query))
        .forEach(s => pool.push({ name: s.name, hp: s.health, type: 'defend', owner: 'Vous' }));
    }
  }

  if (pool.length === 0 || parts.length < 2) { box.classList.add('hidden'); return; }

  pool.forEach((s, i) => {
    const item = document.createElement('div');
    item.className = 'suggestion-item';
    item.dataset.idx = i;
    item.innerHTML = `<span class="suggestion-name">${s.name}</span><span class="suggestion-hp">${s.hp}% · ${s.owner}</span>`;
    item.addEventListener('mousedown', (e) => {
      e.preventDefault();
      input.value = `${cmd} ${s.name}`;
      box.classList.add('hidden');
      input.focus();
    });
    box.appendChild(item);
  });

  box.classList.remove('hidden');
}

// ── COOLDOWN VISUAL ───────────────────────────────────────────────

let cdRafId = null;

function startCooldownVisual(type, duration) {
  const cd = cooldowns[type];
  cd.end = Date.now() + duration;
  cd.duration = duration;

  if (!cdRafId) cdRafId = requestAnimationFrame(tickCooldowns);
}

function tickCooldowns() {
  const now = Date.now();
  let anyActive = false;

  ['attack', 'defend'].forEach(type => {
    const cd      = cooldowns[type];
    const fillEl  = document.getElementById(`cd-${type}-fill`);
    const timerEl = document.getElementById(`cd-${type}-timer`);

    if (!fillEl || !timerEl) return;

    if (now < cd.end) {
      anyActive = true;
      const remaining = cd.end - now;
      const pct = (remaining / cd.duration) * 100;
      fillEl.style.width  = `${pct}%`;
      timerEl.textContent = `${(remaining / 1000).toFixed(1)}s`;
      timerEl.classList.add('active');
    } else {
      fillEl.style.width  = '0%';
      timerEl.textContent = 'PRÊT';
      timerEl.classList.remove('active');
    }
  });

  if (anyActive) cdRafId = requestAnimationFrame(tickCooldowns);
  else cdRafId = null;
}

// ── LOBBY UI ──────────────────────────────────────────────────────

function renderLobby(lobby) {
  document.getElementById('lobby-code-display').textContent = lobby.id;
  isHost = lobby.host === myPlayerId;

  const container = document.getElementById('lobby-players');
  container.innerHTML = '';

  for (let i = 0; i < 4; i++) {
    const slot = document.createElement('div');
    const player = lobby.players[i];

    if (player) {
      slot.className = 'lobby-player-slot occupied';
      slot.innerHTML = `
        <div class="slot-icon">⬡</div>
        <div class="slot-name">${escHtml(player.name)}</div>
        ${player.id === lobby.host ? '<div class="slot-host">HÔTE</div>' : ''}
        ${player.id === myPlayerId ? '<div class="slot-host" style="color:var(--cyan)">VOUS</div>' : ''}
      `;
    } else {
      slot.className = 'lobby-player-slot empty';
      slot.innerHTML = `<div class="slot-icon">○</div><div class="slot-waiting">En attente...</div>`;
    }

    container.appendChild(slot);
  }

  const count  = lobby.players.length;
  const startBtn = document.getElementById('btn-start');
  const hintEl   = document.getElementById('lobby-hint');

  startBtn.disabled = !isHost || count < 2;
  startBtn.style.display = isHost ? '' : 'none';

  if (count < 2) hintEl.textContent = `En attente de joueurs... (${count}/4, min 2)`;
  else if (!isHost) hintEl.textContent = `En attente du démarrage par l'hôte...`;
  else hintEl.textContent = `${count} joueur${count > 1 ? 's' : ''} connecté${count > 1 ? 's' : ''}. Prêt à démarrer !`;
}

function escHtml(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ── SEND COMMAND ──────────────────────────────────────────────────

function sendCommand() {
  const input = document.getElementById('command-input');
  const cmd   = input.value.trim();
  if (!cmd) return;

  cmdHistory.unshift(cmd);
  if (cmdHistory.length > 30) cmdHistory.pop();
  cmdHistIdx = -1;

  socket.emit('command', { command: cmd });

  document.getElementById('suggestions').classList.add('hidden');
  input.value = '';
  setFeedback('');
}

function setFeedback(msg, ok = false) {
  const el = document.getElementById('command-feedback');
  el.textContent = msg;
  el.className = 'command-feedback' + (ok ? ' success' : '');
}

// ── EVENT HANDLERS ────────────────────────────────────────────────

document.getElementById('btn-create').addEventListener('click', () => {
  const name = document.getElementById('player-name').value.trim();
  if (!name) { setError('Entrez un nom de joueur.'); return; }
  socket.emit('createLobby', { playerName: name });
});

document.getElementById('btn-join').addEventListener('click', () => {
  const name  = document.getElementById('player-name').value.trim();
  const code  = document.getElementById('lobby-code-input').value.trim().toUpperCase();
  if (!name) { setError('Entrez un nom de joueur.'); return; }
  if (!code) { setError('Entrez un code de lobby.'); return; }
  socket.emit('joinLobby', { lobbyId: code, playerName: name });
});

document.getElementById('lobby-code-input').addEventListener('keydown', e => {
  if (e.key === 'Enter') document.getElementById('btn-join').click();
});
document.getElementById('player-name').addEventListener('keydown', e => {
  if (e.key === 'Enter') document.getElementById('btn-create').click();
});

document.getElementById('btn-copy').addEventListener('click', () => {
  const code = document.getElementById('lobby-code-display').textContent;
  navigator.clipboard.writeText(code).catch(() => {});
  const btn = document.getElementById('btn-copy');
  btn.textContent = '✓'; setTimeout(() => btn.textContent = '⎘', 1500);
});

document.getElementById('btn-start').addEventListener('click', () => {
  socket.emit('startGame');
});

document.getElementById('btn-leave').addEventListener('click', () => {
  location.reload();
});

document.getElementById('btn-send').addEventListener('click', sendCommand);

document.getElementById('btn-play-again').addEventListener('click', () => {
  location.reload();
});

// Command input keyboard handling
document.getElementById('command-input').addEventListener('keydown', e => {
  const box = document.getElementById('suggestions');
  const items = box.querySelectorAll('.suggestion-item');
  const active = box.querySelector('.suggestion-item.active');
  let idx = active ? parseInt(active.dataset.idx) : -1;

  if (e.key === 'Enter') {
    e.preventDefault();
    if (active) {
      active.dispatchEvent(new MouseEvent('mousedown'));
    } else {
      sendCommand();
    }
    return;
  }

  if (e.key === 'ArrowDown') {
    e.preventDefault();
    if (!box.classList.contains('hidden') && items.length) {
      const next = Math.min(idx + 1, items.length - 1);
      items.forEach(it => it.classList.remove('active'));
      items[next].classList.add('active');
    } else if (cmdHistory.length) {
      cmdHistIdx = Math.min(cmdHistIdx + 1, cmdHistory.length - 1);
      e.target.value = cmdHistory[cmdHistIdx];
    }
    return;
  }

  if (e.key === 'ArrowUp') {
    e.preventDefault();
    if (!box.classList.contains('hidden') && items.length && idx > 0) {
      items.forEach(it => it.classList.remove('active'));
      items[idx - 1].classList.add('active');
    } else if (cmdHistIdx > 0) {
      cmdHistIdx--;
      e.target.value = cmdHistory[cmdHistIdx];
    }
    return;
  }

  if (e.key === 'Escape') { box.classList.add('hidden'); }
});

document.getElementById('command-input').addEventListener('input', updateSuggestions);

// ── SOCKET EVENTS ─────────────────────────────────────────────────

socket.on('lobbyCreated', ({ lobbyId, playerId, lobby }) => {
  myPlayerId = playerId;
  myLobbyId  = lobbyId;
  gameState  = lobby;
  renderLobby(lobby);
  showScreen('screen-lobby');
});

socket.on('lobbyJoined', ({ playerId, lobby }) => {
  myPlayerId = playerId;
  myLobbyId  = lobby.id;
  gameState  = lobby;
  renderLobby(lobby);
  showScreen('screen-lobby');
});

socket.on('playerJoined', ({ lobby }) => {
  gameState = lobby;
  renderLobby(lobby);
});

socket.on('playerLeft', ({ playerId, lobby }) => {
  gameState = lobby;

  if (document.getElementById('screen-lobby').classList.contains('active')) {
    renderLobby(lobby);
  } else {
    renderSidebar();
    addLog(`Un joueur a quitté la partie.`, 'log-system');
  }
});

socket.on('gameStarted', ({ lobby }) => {
  gameState = lobby;
  const me  = lobby.players.find(p => p.id === myPlayerId);
  if (!me) return;

  document.getElementById('game-player-badge').textContent = me.name.toUpperCase();
  document.getElementById('my-servers').innerHTML = '';
  document.getElementById('other-players').innerHTML = '';

  renderMyServers();
  renderSidebar();
  showScreen('screen-game');
  addLog('Partie commencée ! Bonne chance.', 'log-system');
});

socket.on('gameState', ({ lobby }) => {
  gameState = lobby;
  renderMyServers();
  renderSidebar();
});

socket.on('gameEvent', (ev) => {
  if (ev.type === 'attack') {
    animateServer(ev.targetServerName, 'attack');
    const who    = ev.attackerId === myPlayerId ? 'Vous avez attaqué' : `${ev.attackerName} attaque`;
    const target = ev.targetPlayerId === myPlayerId ? 'votre' : `le`;
    addLog(
      `${who} ${target} serveur <b>${ev.targetServerName}</b> (${ev.targetPlayerName}) — -20% → ${ev.newHealth}%`,
      'log-attack'
    );

    if (ev.newHealth <= 0) {
      setTimeout(() => {
        addLog(`⚠ Serveur <b>${ev.targetServerName}</b> DÉTRUIT !`, 'log-destroy');
      }, 500);
    }
  } else if (ev.type === 'defend') {
    animateServer(ev.targetServerName, 'defend');
    const who = ev.playerId === myPlayerId ? 'Vous avez défendu' : `${ev.playerName} défend`;
    addLog(
      `${who} <b>${ev.targetServerName}</b> — +15% → ${ev.newHealth}%`,
      'log-defend'
    );
  }
});

socket.on('gameOver', ({ winner, draw }) => {
  document.getElementById('overlay-gameover').classList.remove('hidden');
  const title = document.getElementById('gameover-title');
  const msg   = document.getElementById('gameover-msg');

  if (draw) {
    title.textContent = 'ÉGALITÉ';
    msg.textContent   = 'Tous les serveurs sont tombés simultanément.';
    title.style.color = 'var(--orange)';
  } else if (winner?.id === myPlayerId) {
    title.textContent = 'VICTOIRE !';
    msg.textContent   = 'Vos serveurs tiennent encore. La guerre est gagnée.';
    title.style.color = 'var(--neon)';
    addLog('⬡ VICTOIRE ! Vous êtes le dernier debout.', 'log-win');
  } else {
    title.textContent = 'DÉFAITE';
    msg.innerHTML     = `<b>${escHtml(winner?.name ?? '???')}</b> remporte la partie.`;
    title.style.color = 'var(--red)';
    addLog(`✕ Défaite. ${winner?.name ?? '???'} a gagné.`, 'log-attack');
  }

  document.getElementById('game-status-badge').textContent = 'FIN';
  document.getElementById('game-status-badge').style.background = draw ? 'var(--orange)' : winner?.id === myPlayerId ? 'var(--neon)' : 'var(--red)';
});

socket.on('cooldownStart', ({ type, duration }) => {
  startCooldownVisual(type, duration);
});

socket.on('commandError', ({ message, cooldown }) => {
  setFeedback(message, false);
  setTimeout(() => setFeedback(''), 3000);
});

socket.on('error', ({ message }) => {
  setError(message);
});

socket.on('disconnect', () => {
  setError('Connexion perdue avec le serveur.');
});

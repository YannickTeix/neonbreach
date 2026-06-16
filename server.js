const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

const CODENAMES = [
  'NEXUS', 'PHANTOM', 'CIPHER', 'VECTOR', 'TITAN', 'NOVA',
  'FORGE', 'PULSE', 'ECHO', 'STORM', 'APEX', 'VORTEX',
  'HYDRA', 'OMEGA', 'SIGMA', 'DELTA', 'AURORA', 'ZENITH',
  'SPECTER', 'COBALT', 'RAVEN', 'INFERNO', 'ARKOS', 'HELIOS',
  'BLAZE', 'FROST', 'SHADE', 'PRISM', 'QUASAR', 'NEBULA'
];

const lobbies = {};

function generateLobbyId() {
  return Math.random().toString(36).substr(2, 4).toUpperCase();
}

function getUniqueServerNames(count) {
  const pool = [...CODENAMES].sort(() => Math.random() - 0.5);
  return pool.slice(0, count);
}

function assignNamesToLobby(lobby) {
  const totalServers = lobby.players.length * 3;
  const names = getUniqueServerNames(totalServers);
  lobby.players.forEach((player, i) => {
    player.servers = names.slice(i * 3, i * 3 + 3).map(name => ({
      name,
      health: 100
    }));
  });
}

function sanitizePlayer(player) {
  return {
    id: player.id,
    name: player.name,
    servers: player.servers
  };
}

function sanitizeLobby(lobby) {
  return {
    id: lobby.id,
    host: lobby.host,
    gameStarted: lobby.gameStarted,
    players: lobby.players.map(sanitizePlayer)
  };
}

function checkWinCondition(lobby) {
  const alive = lobby.players.filter(p =>
    p.servers && p.servers.some(s => s.health > 0)
  );
  if (alive.length === 1 && lobby.players.length > 1) return alive[0];
  if (alive.length === 0) return 'draw';
  return null;
}

io.on('connection', (socket) => {

  socket.on('createLobby', ({ playerName }) => {
    if (!playerName || !playerName.trim()) return;
    const lobbyId = generateLobbyId();
    const player = {
      id: socket.id,
      name: playerName.trim().slice(0, 20),
      servers: [],
      cooldowns: { attack: 0, defend: 0 }
    };

    lobbies[lobbyId] = {
      id: lobbyId,
      players: [player],
      gameStarted: false,
      host: socket.id
    };

    socket.join(lobbyId);
    socket.lobbyId = lobbyId;
    socket.emit('lobbyCreated', { lobbyId, playerId: socket.id, lobby: sanitizeLobby(lobbies[lobbyId]) });
  });

  socket.on('joinLobby', ({ lobbyId, playerName }) => {
    const lobby = lobbies[lobbyId];
    if (!lobby) { socket.emit('error', { message: 'Lobby introuvable.' }); return; }
    if (lobby.gameStarted) { socket.emit('error', { message: 'La partie a déjà commencé.' }); return; }
    if (lobby.players.length >= 4) { socket.emit('error', { message: 'Lobby plein (4/4).' }); return; }
    if (!playerName || !playerName.trim()) return;

    const player = {
      id: socket.id,
      name: playerName.trim().slice(0, 20),
      servers: [],
      cooldowns: { attack: 0, defend: 0 }
    };

    lobby.players.push(player);
    socket.join(lobbyId);
    socket.lobbyId = lobbyId;

    socket.emit('lobbyJoined', { playerId: socket.id, lobby: sanitizeLobby(lobby) });
    socket.to(lobbyId).emit('playerJoined', { player: sanitizePlayer(player), lobby: sanitizeLobby(lobby) });
  });

  socket.on('startGame', () => {
    const lobby = lobbies[socket.lobbyId];
    if (!lobby || lobby.host !== socket.id) return;
    if (lobby.players.length < 2) {
      socket.emit('error', { message: 'Il faut au moins 2 joueurs.' });
      return;
    }

    assignNamesToLobby(lobby);
    lobby.gameStarted = true;
    io.to(socket.lobbyId).emit('gameStarted', { lobby: sanitizeLobby(lobby) });
  });

  socket.on('command', ({ command }) => {
    const lobby = lobbies[socket.lobbyId];
    if (!lobby || !lobby.gameStarted) return;

    const player = lobby.players.find(p => p.id === socket.id);
    if (!player || !player.servers.some(s => s.health > 0)) return;

    const now = Date.now();
    const parts = command.trim().split(/\s+/);
    const cmd = parts[0]?.toLowerCase();
    const targetName = parts.slice(1).join(' ').toUpperCase().trim();

    if (!targetName) {
      socket.emit('commandError', { message: `Usage: ${cmd} <nom_du_serveur>` });
      return;
    }

    if (cmd === 'attack') {
      if (now < player.cooldowns.attack) {
        const rem = ((player.cooldowns.attack - now) / 1000).toFixed(1);
        socket.emit('commandError', { message: `⏱ Cooldown attack: ${rem}s restantes`, cooldown: true });
        return;
      }

      let targetPlayer = null;
      let targetServer = null;

      for (const p of lobby.players) {
        if (p.id === socket.id) continue;
        const s = p.servers.find(s => s.name === targetName && s.health > 0);
        if (s) { targetPlayer = p; targetServer = s; break; }
      }

      if (!targetServer) {
        const allEnemyServers = lobby.players
          .filter(p => p.id !== socket.id)
          .flatMap(p => p.servers.filter(s => s.health > 0).map(s => s.name));
        socket.emit('commandError', {
          message: `Serveur "${targetName}" introuvable ou détruit. Serveurs disponibles: ${allEnemyServers.join(', ') || 'aucun'}`
        });
        return;
      }

      targetServer.health = Math.max(0, targetServer.health - 20);
      player.cooldowns.attack = now + 3000;

      const event = {
        type: 'attack',
        attackerId: player.id,
        attackerName: player.name,
        targetPlayerId: targetPlayer.id,
        targetPlayerName: targetPlayer.name,
        targetServerName: targetServer.name,
        damage: 20,
        newHealth: targetServer.health
      };

      io.to(socket.lobbyId).emit('gameEvent', event);
      io.to(socket.lobbyId).emit('gameState', { lobby: sanitizeLobby(lobby) });
      socket.emit('cooldownStart', { type: 'attack', duration: 3000 });

      const winner = checkWinCondition(lobby);
      if (winner) {
        lobby.gameStarted = false;
        io.to(socket.lobbyId).emit('gameOver', {
          winner: winner === 'draw' ? null : sanitizePlayer(winner),
          draw: winner === 'draw'
        });
      }

    } else if (cmd === 'defend') {
      if (now < player.cooldowns.defend) {
        const rem = ((player.cooldowns.defend - now) / 1000).toFixed(1);
        socket.emit('commandError', { message: `⏱ Cooldown defend: ${rem}s restantes`, cooldown: true });
        return;
      }

      const targetServer = player.servers.find(s => s.name === targetName);

      if (!targetServer) {
        const myServers = player.servers.map(s => s.name).join(', ');
        socket.emit('commandError', { message: `Serveur "${targetName}" introuvable. Vos serveurs: ${myServers}` });
        return;
      }

      if (targetServer.health === 0) {
        socket.emit('commandError', { message: `"${targetName}" est détruit, impossible de le défendre.` });
        return;
      }

      targetServer.health = Math.min(100, targetServer.health + 15);
      player.cooldowns.defend = now + 5000;

      const event = {
        type: 'defend',
        playerId: player.id,
        playerName: player.name,
        targetServerName: targetServer.name,
        heal: 15,
        newHealth: targetServer.health
      };

      io.to(socket.lobbyId).emit('gameEvent', event);
      io.to(socket.lobbyId).emit('gameState', { lobby: sanitizeLobby(lobby) });
      socket.emit('cooldownStart', { type: 'defend', duration: 5000 });

    } else {
      socket.emit('commandError', {
        message: `Commande inconnue: "${cmd}". Utilisez attack ou defend.`
      });
    }
  });

  socket.on('disconnect', () => {
    const lobby = lobbies[socket.lobbyId];
    if (!lobby) return;

    const wasInGame = lobby.gameStarted;
    lobby.players = lobby.players.filter(p => p.id !== socket.id);

    if (lobby.players.length === 0) {
      delete lobbies[socket.lobbyId];
      return;
    }

    if (lobby.host === socket.id) {
      lobby.host = lobby.players[0].id;
    }

    io.to(socket.lobbyId).emit('playerLeft', {
      playerId: socket.id,
      lobby: sanitizeLobby(lobby)
    });

    if (wasInGame) {
      const winner = checkWinCondition(lobby);
      if (winner) {
        lobby.gameStarted = false;
        io.to(socket.lobbyId).emit('gameOver', {
          winner: winner === 'draw' ? null : sanitizePlayer(winner),
          draw: winner === 'draw'
        });
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`SERVER WARS running on http://localhost:${PORT}`);
});

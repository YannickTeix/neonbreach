const { LobbyService } = require('../services/lobbyService');
const { checkWinCondition, parseCommand, handleAttack, handleDefend } = require('../services/gameService');

function registerSocketHandlers(io) {
  const lobbyService = new LobbyService();

  function emitGameOver(lobbyId, lobby) {
    const winner = checkWinCondition(lobby);
    if (!winner) return;

    lobby.gameStarted = false;
    io.to(lobbyId).emit('gameOver', {
      winner: winner === 'draw' ? null : lobbyService.sanitizePlayer(winner),
      draw: winner === 'draw',
    });
  }

  io.on('connection', (socket) => {
    socket.on('createLobby', ({ playerName }) => {
      if (!playerName || !playerName.trim()) return;

      const lobby = lobbyService.createLobby(socket.id, playerName);
      socket.join(lobby.id);
      socket.lobbyId = lobby.id;

      socket.emit('lobbyCreated', {
        lobbyId: lobby.id,
        playerId: socket.id,
        lobby: lobbyService.sanitizeLobby(lobby),
      });
    });

    socket.on('joinLobby', ({ lobbyId, playerName }) => {
      if (!playerName || !playerName.trim()) return;

      const { error, lobby, player } = lobbyService.joinLobby(lobbyId, socket.id, playerName);
      if (error) { socket.emit('error', { message: error }); return; }

      socket.join(lobbyId);
      socket.lobbyId = lobbyId;

      socket.emit('lobbyJoined', { playerId: socket.id, lobby: lobbyService.sanitizeLobby(lobby) });
      socket.to(lobbyId).emit('playerJoined', {
        player: lobbyService.sanitizePlayer(player),
        lobby: lobbyService.sanitizeLobby(lobby),
      });
    });

    socket.on('startGame', () => {
      const lobby = lobbyService.getLobby(socket.lobbyId);
      if (!lobby || lobby.host !== socket.id) return;

      if (lobby.players.length < 2) {
        socket.emit('error', { message: 'Il faut au moins 2 joueurs.' });
        return;
      }

      lobbyService.startGame(lobby);
      io.to(socket.lobbyId).emit('gameStarted', { lobby: lobbyService.sanitizeLobby(lobby) });
    });

    socket.on('command', ({ command }) => {
      const lobby = lobbyService.getLobby(socket.lobbyId);
      if (!lobby || !lobby.gameStarted) return;

      const player = lobbyService.getPlayer(lobby, socket.id);
      if (!player || !player.servers.some((s) => s.health > 0)) return;

      const { cmd, targetName } = parseCommand(command);

      if (!targetName) {
        socket.emit('commandError', { message: `Usage: ${cmd} <nom_du_serveur>` });
        return;
      }

      let result;
      if (cmd === 'attack') {
        result = handleAttack(lobby, player, targetName);
      } else if (cmd === 'defend') {
        result = handleDefend(player, targetName);
      } else {
        socket.emit('commandError', { message: `Commande inconnue: "${cmd}". Utilisez attack ou defend.` });
        return;
      }

      if (result.error) {
        socket.emit('commandError', { message: result.error, cooldown: result.cooldown });
        return;
      }

      io.to(socket.lobbyId).emit('gameEvent', result.event);
      io.to(socket.lobbyId).emit('gameState', { lobby: lobbyService.sanitizeLobby(lobby) });
      socket.emit('cooldownStart', { type: cmd, duration: result.cooldownDuration });

      if (cmd === 'attack') emitGameOver(socket.lobbyId, lobby);
    });

    socket.on('disconnect', () => {
      const wasInGame = lobbyService.getLobby(socket.lobbyId)?.gameStarted;
      const lobby = lobbyService.removePlayer(socket.lobbyId, socket.id);
      if (!lobby) return;

      io.to(socket.lobbyId).emit('playerLeft', {
        playerId: socket.id,
        lobby: lobbyService.sanitizeLobby(lobby),
      });

      if (wasInGame) emitGameOver(socket.lobbyId, lobby);
    });
  });
}

module.exports = { registerSocketHandlers };

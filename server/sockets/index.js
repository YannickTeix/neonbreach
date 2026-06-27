const { LobbyService } = require('../services/lobbyService');
const {
  checkWinCondition, parseCommand,
  handleAttack, handleDefend, handleBlurchange,
  handleBreachPrepare, handleBreachConnect, generateBreacherName,
  BREACH_PREPARE_DURATION_MS,
} = require('../services/gameService');

function registerSocketHandlers(io) {
  const lobbyService = new LobbyService();

  function clearNeofragIntervals(lobby) {
    if (lobby.neofragIntervals) {
      lobby.neofragIntervals.forEach(clearInterval);
      lobby.neofragIntervals = [];
    }
  }

  function emitGameOver(lobbyId, lobby) {
    const winner = checkWinCondition(lobby);
    if (!winner) return;

    clearNeofragIntervals(lobby);
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

      lobby.neofragIntervals = [];
      for (const player of lobby.players) {
        for (const server of player.servers) {
          const intervalId = setInterval(() => {
            if (!lobby.gameStarted || server.health <= 0) return;
            player.neofrags += server.neofragGain;
            io.to(player.id).emit('neofragUpdate', { neofrags: player.neofrags });
          }, server.neofragFreq);
          lobby.neofragIntervals.push(intervalId);
        }
      }

      io.to(socket.lobbyId).emit('gameStarted', { lobby: lobbyService.sanitizeLobby(lobby) });
    });

    socket.on('command', ({ command }) => {
      const lobby = lobbyService.getLobby(socket.lobbyId);
      if (!lobby || !lobby.gameStarted) return;

      const player = lobbyService.getPlayer(lobby, socket.id);
      if (!player || !player.servers.some((s) => s.health > 0)) return;

      const { cmd, targetName } = parseCommand(command);

      if (cmd === 'breach') {
        const bParts = targetName.split(/\s+/);
        const subCmd = bParts[0]?.toLowerCase();

        if (subCmd === 'prepare') {
          const serverName = bParts.slice(1).join(' ').trim();
          if (!serverName) {
            socket.emit('commandError', { message: 'Usage: breach prepare <nomServeur>' });
            return;
          }
          const result = handleBreachPrepare(lobby, player, serverName);
          if (result.error) {
            socket.emit('commandError', { message: result.error });
            return;
          }
          socket.emit('breachPreparing', {
            breachId: result.breachId,
            sourceServer: result.sourceServer,
            duration: result.duration,
          });
          io.to(player.id).emit('neofragUpdate', { neofrags: result.neofrags });

          const playerId = socket.id;
          const lobbyId = socket.lobbyId;
          const { breachId } = result;

          setTimeout(() => {
            const currentLobby = lobbyService.getLobby(lobbyId);
            if (!currentLobby || !currentLobby.gameStarted) return;
            const currentPlayer = lobbyService.getPlayer(currentLobby, playerId);
            if (!currentPlayer) return;
            const breacher = (currentPlayer.breachers || []).find((b) => b.id === breachId);
            if (!breacher || breacher.state !== 'preparing') return;

            const sourceServer = currentPlayer.servers.find((s) => s.name === breacher.sourceServer);
            if (!sourceServer || sourceServer.health <= 0) {
              currentPlayer.breachers = currentPlayer.breachers.filter((b) => b.id !== breachId);
              socket.emit('breachCancelled', { breachId, reason: 'Serveur source detruit.' });
              return;
            }

            const name = generateBreacherName(currentLobby);
            breacher.name = name;
            breacher.state = 'ready';
            socket.emit('breachReady', {
              breachId,
              sourceServer: breacher.sourceServer,
              breacherName: name,
            });
          }, BREACH_PREPARE_DURATION_MS);
          return;
        }

        if (subCmd === 'connect') {
          const connectParts = bParts.slice(1);
          if (connectParts.length < 2) {
            socket.emit('commandError', { message: 'Usage: breach connect <nomBreacher> <nomJoueur>' });
            return;
          }
          const breacherName = connectParts[0];
          const targetPlayerName = connectParts.slice(1).join(' ').trim();
          const result = handleBreachConnect(lobby, player, breacherName, targetPlayerName);
          if (result.error) {
            socket.emit('commandError', { message: result.error });
            return;
          }
          socket.emit('breachConnected', {
            breacherId: result.breacherId,
            breacherName: result.breacherName,
            sourceServer: result.sourceServer,
            targetPlayerId: result.targetPlayerId,
            targetPlayerName: result.targetPlayerName,
          });
          io.to(player.id).emit('neofragUpdate', { neofrags: result.neofrags });
          return;
        }

        socket.emit('commandError', {
          message: 'Sous-commande inconnue. Utilisez: breach prepare <serveur> ou breach connect <breacher> <joueur>.',
        });
        return;
      }

      if (!targetName) {
        socket.emit('commandError', { message: `Usage: ${cmd} <nom_du_serveur>` });
        return;
      }

      if (cmd === 'blurchange') {
        const result = handleBlurchange(lobby, player, targetName);
        if (result.error) {
          socket.emit('commandError', { message: result.error, cooldown: result.cooldown });
          return;
        }
        socket.to(socket.lobbyId).emit('blurchangeStart', {
          playerId: player.id,
          playerName: player.name,
          targetPlayerName: result.targetPlayerName,
          serverNames: result.serverNames,
        });
        socket.emit('cooldownStart', { type: 'blurchange', duration: result.cooldownDuration });
        const lobbyId = socket.lobbyId;
        const casterId = socket.id;
        setTimeout(() => {
          io.to(lobbyId).except(casterId).emit('blurchangeEnd', {
            targetPlayerName: result.targetPlayerName,
            serverNames: result.serverNames,
          });
        }, result.blurDuration);
        return;
      }

      let result;
      if (cmd === 'attack') {
        result = handleAttack(lobby, player, targetName);
      } else if (cmd === 'defend') {
        result = handleDefend(player, targetName);
      } else {
        socket.emit('commandError', {
          message: `Commande inconnue: "${cmd}". Utilisez attack, defend, blurchange ou breach.`,
        });
        return;
      }

      if (result.error) {
        socket.emit('commandError', { message: result.error, cooldown: result.cooldown });
        return;
      }

      io.to(socket.lobbyId).emit('gameEvent', result.event);
      io.to(socket.lobbyId).emit('gameState', { lobby: lobbyService.sanitizeLobby(lobby) });
      socket.emit('cooldownStart', { type: cmd, duration: result.cooldownDuration });

      if (cmd === 'attack' && result.event.newHealth === 0) {
        const targetPlayer = lobby.players.find((p) => p.id === result.event.targetPlayerId);
        if (targetPlayer && targetPlayer.breachers && targetPlayer.breachers.length > 0) {
          const destroyed = targetPlayer.breachers.filter(
            (b) => b.sourceServer === result.event.targetServerName
          );
          if (destroyed.length > 0) {
            targetPlayer.breachers = targetPlayer.breachers.filter(
              (b) => b.sourceServer !== result.event.targetServerName
            );
            for (const b of destroyed) {
              io.to(targetPlayer.id).emit('breachCancelled', {
                breachId: b.id,
                reason: `Serveur ${b.sourceServer} détruit.`,
              });
            }
          }
        }
      }

      if (cmd === 'attack') emitGameOver(socket.lobbyId, lobby);
    });

    socket.on('disconnect', () => {
      const preLobby = lobbyService.getLobby(socket.lobbyId);
      if (!preLobby) return;
      const wasInGame = preLobby.gameStarted;
      const lobby = lobbyService.removePlayer(socket.lobbyId, socket.id);

      if (!lobby) {
        clearNeofragIntervals(preLobby);
        return;
      }

      io.to(socket.lobbyId).emit('playerLeft', {
        playerId: socket.id,
        lobby: lobbyService.sanitizeLobby(lobby),
      });

      if (wasInGame) emitGameOver(socket.lobbyId, lobby);
    });
  });
}

module.exports = { registerSocketHandlers };

const { LobbyService } = require('../services/lobbyService');
const {
  checkWinCondition, parseCommand,
  handleAttack, handleDefend, handleBlurchange,
  handleBreachPrepare, handleBreachConnect, generateBreacherName,
  handleResearchPrepare, handleResearchUpload,
  handleUpgradeIntegrity, applyIntegrityUpgrade, resetIntegrityUpgrades,
  BREACH_PREPARE_DURATION_MS, RESEARCH_PREPARE_DURATION_MS, UPGRADE_INTEGRITY_DURATION_MS,
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

  // Annule brècheurs + module de recherche (et resets d'integrity) quand un serveur est détruit
  function cancelResourcesOnServerDestroy(targetPlayer, destroyedServerName) {
    if (targetPlayer.breachers && targetPlayer.breachers.length > 0) {
      const destroyed = targetPlayer.breachers.filter((b) => b.sourceServer === destroyedServerName);
      if (destroyed.length > 0) {
        targetPlayer.breachers = targetPlayer.breachers.filter((b) => b.sourceServer !== destroyedServerName);
        for (const b of destroyed) {
          io.to(targetPlayer.id).emit('breachCancelled', { breachId: b.id, reason: `Serveur ${b.sourceServer} détruit.` });
        }
      }
    }

    if (targetPlayer.researchModule && targetPlayer.researchModule.sourceServer === destroyedServerName) {
      const wasActive = targetPlayer.researchModule.state === 'active';
      targetPlayer.researchModule = null;
      if (wasActive) resetIntegrityUpgrades(targetPlayer);
      io.to(targetPlayer.id).emit('researchCancelled', { reason: `Serveur ${destroyedServerName} détruit.` });
    }
  }

  io.on('connection', (socket) => {

    // ── REJOIN ────────────────────────────────────────────────────────────
    socket.on('rejoin', ({ sessionToken, lobbyId }) => {
      const lobby = lobbyService.getLobby(lobbyId);
      if (!lobby) { socket.emit('rejoinFailed', { reason: 'Partie introuvable.' }); return; }

      const player = lobbyService.getPlayerByToken(lobby, sessionToken);
      if (!player) { socket.emit('rejoinFailed', { reason: 'Session introuvable.' }); return; }

      // Mettre à jour le socket id du joueur
      player.id = socket.id;
      socket.lobbyId = lobbyId;
      socket.join(lobbyId);

      socket.emit('rejoinSuccess', {
        playerId: socket.id,
        lobby: lobbyService.sanitizeLobby(lobby),
        neofrags: player.neofrags,
        breachers: player.breachers || [],
        researchModule: player.researchModule || null,
      });
    });

    // ── CREATE / JOIN ─────────────────────────────────────────────────────
    socket.on('createLobby', ({ playerName }) => {
      if (!playerName || !playerName.trim()) return;
      const lobby = lobbyService.createLobby(socket.id, playerName);
      const player = lobby.players[0];
      socket.join(lobby.id);
      socket.lobbyId = lobby.id;
      socket.emit('lobbyCreated', { lobbyId: lobby.id, playerId: socket.id, sessionToken: player.sessionToken, lobby: lobbyService.sanitizeLobby(lobby) });
    });

    socket.on('joinLobby', ({ lobbyId, playerName }) => {
      if (!playerName || !playerName.trim()) return;
      const { error, lobby, player } = lobbyService.joinLobby(lobbyId, socket.id, playerName);
      if (error) { socket.emit('error', { message: error }); return; }
      socket.join(lobbyId);
      socket.lobbyId = lobbyId;
      socket.emit('lobbyJoined', { playerId: socket.id, sessionToken: player.sessionToken, lobby: lobbyService.sanitizeLobby(lobby) });
      socket.to(lobbyId).emit('playerJoined', { player: lobbyService.sanitizePlayer(player), lobby: lobbyService.sanitizeLobby(lobby) });
    });

    // ── START GAME ────────────────────────────────────────────────────────
    socket.on('startGame', () => {
      const lobby = lobbyService.getLobby(socket.lobbyId);
      if (!lobby || lobby.host !== socket.id) return;
      if (lobby.players.length < 2) { socket.emit('error', { message: 'Il faut au moins 2 joueurs.' }); return; }

      lobbyService.startGame(lobby);

      lobby.neofragIntervals = [];
      for (const player of lobby.players) {
        for (const server of player.servers) {
          const intervalId = setInterval(() => {
            if (!lobby.gameStarted || server.currentIntegrity <= 0) return;
            player.neofrags += server.neofragGain;
            io.to(player.id).emit('neofragUpdate', { neofrags: player.neofrags });
          }, server.neofragFreq);
          lobby.neofragIntervals.push(intervalId);
        }
      }

      io.to(socket.lobbyId).emit('gameStarted', { lobby: lobbyService.sanitizeLobby(lobby) });
    });

    // ── STOP GAME ─────────────────────────────────────────────────────────
    socket.on('stopGame', () => {
      const lobby = lobbyService.getLobby(socket.lobbyId);
      if (!lobby || !lobby.gameStarted) return;
      const player = lobbyService.getPlayer(lobby, socket.id);

      clearNeofragIntervals(lobby);
      lobby.gameStarted = false;

      io.to(socket.lobbyId).emit('gameStopped', { stoppedBy: player?.name ?? '???' });
      lobbyService.deleteLobby(socket.lobbyId);
    });

    // ── COMMAND ───────────────────────────────────────────────────────────
    socket.on('command', ({ command }) => {
      const lobby = lobbyService.getLobby(socket.lobbyId);
      if (!lobby || !lobby.gameStarted) return;

      const player = lobbyService.getPlayer(lobby, socket.id);
      if (!player || !player.servers.some((s) => s.currentIntegrity > 0)) return;

      const { cmd, targetName } = parseCommand(command);

      // ── BREACH ────────────────────────────────────────────────────────
      if (cmd === 'breach') {
        const bParts = targetName.split(/\s+/);
        const subCmd = bParts[0]?.toLowerCase();

        if (subCmd === 'prepare') {
          const serverName = bParts.slice(1).join(' ').trim();
          if (!serverName) { socket.emit('commandError', { message: 'Usage: breach prepare <nomServeur>' }); return; }
          const result = handleBreachPrepare(lobby, player, serverName);
          if (result.error) { socket.emit('commandError', { message: result.error }); return; }

          socket.emit('breachPreparing', { breachId: result.breachId, sourceServer: result.sourceServer, duration: result.duration });
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
            if (!sourceServer || sourceServer.currentIntegrity <= 0) {
              currentPlayer.breachers = currentPlayer.breachers.filter((b) => b.id !== breachId);
              io.to(currentPlayer.id).emit('breachCancelled', { breachId, reason: 'Serveur source détruit.' });
              return;
            }
            const name = generateBreacherName(currentLobby);
            breacher.name = name;
            breacher.state = 'ready';
            io.to(currentPlayer.id).emit('breachReady', { breachId, sourceServer: breacher.sourceServer, breacherName: name });
          }, BREACH_PREPARE_DURATION_MS);
          return;
        }

        if (subCmd === 'connect') {
          const connectParts = bParts.slice(1);
          if (connectParts.length < 2) { socket.emit('commandError', { message: 'Usage: breach connect <nomBreacher> <nomJoueur>' }); return; }
          const breacherName = connectParts[0];
          const targetPlayerName = connectParts.slice(1).join(' ').trim();
          const result = handleBreachConnect(lobby, player, breacherName, targetPlayerName);
          if (result.error) { socket.emit('commandError', { message: result.error }); return; }
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

        socket.emit('commandError', { message: 'Sous-commande inconnue. Utilisez: breach prepare <serveur> ou breach connect <breacher> <joueur>.' });
        return;
      }

      // ── RESEARCH ──────────────────────────────────────────────────────
      if (cmd === 'research') {
        const rParts = targetName.split(/\s+/);
        const subCmd = rParts[0]?.toLowerCase();

        if (subCmd === 'prepare') {
          const serverName = rParts.slice(1).join(' ').trim();
          if (!serverName) { socket.emit('commandError', { message: 'Usage: research prepare <nomServeur>' }); return; }
          const result = handleResearchPrepare(player, serverName);
          if (result.error) { socket.emit('commandError', { message: result.error }); return; }

          socket.emit('researchPreparing', { sourceServer: result.sourceServer, duration: result.duration });
          io.to(player.id).emit('neofragUpdate', { neofrags: result.neofrags });

          const playerId = socket.id;
          const lobbyId = socket.lobbyId;
          const sourceServer = result.sourceServer;

          setTimeout(() => {
            const currentLobby = lobbyService.getLobby(lobbyId);
            if (!currentLobby || !currentLobby.gameStarted) return;
            const currentPlayer = lobbyService.getPlayer(currentLobby, playerId);
            if (!currentPlayer || !currentPlayer.researchModule) return;
            if (currentPlayer.researchModule.state !== 'preparing') return;
            const srv = currentPlayer.servers.find((s) => s.name === sourceServer);
            if (!srv || srv.currentIntegrity <= 0) {
              currentPlayer.researchModule = null;
              io.to(currentPlayer.id).emit('researchCancelled', { reason: 'Serveur source détruit.' });
              return;
            }
            currentPlayer.researchModule.state = 'active';
            io.to(currentPlayer.id).emit('researchReady', { sourceServer });
          }, RESEARCH_PREPARE_DURATION_MS);
          return;
        }

        if (subCmd === 'upload') {
          const amountStr = rParts[1];
          if (!amountStr) { socket.emit('commandError', { message: 'Usage: research upload <nbNeofrags>' }); return; }
          const result = handleResearchUpload(player, amountStr);
          if (result.error) { socket.emit('commandError', { message: result.error }); return; }
          socket.emit('researchUpdated', { module: result.module });
          io.to(player.id).emit('neofragUpdate', { neofrags: result.neofrags });
          return;
        }

        socket.emit('commandError', { message: 'Sous-commande inconnue. Utilisez: research prepare <serveur> ou research upload <neofrags>.' });
        return;
      }

      // ── UPGRADE ───────────────────────────────────────────────────────
      if (cmd === 'upgrade') {
        const uParts = targetName.split(/\s+/);
        const serverName = uParts[0];
        const subType = uParts[1];
        if (!serverName || subType !== 'INTEGRITY') {
          socket.emit('commandError', { message: 'Usage: upgrade <nomServeur> integrity' });
          return;
        }
        const result = handleUpgradeIntegrity(player, serverName);
        if (result.error) { socket.emit('commandError', { message: result.error }); return; }

        socket.emit('upgradePreparing', { serverName: result.serverName, duration: result.duration });
        io.to(player.id).emit('neofragUpdate', { neofrags: result.neofrags });

        const playerId = socket.id;
        const lobbyId = socket.lobbyId;
        const upgServerName = result.serverName;

        setTimeout(() => {
          const currentLobby = lobbyService.getLobby(lobbyId);
          if (!currentLobby || !currentLobby.gameStarted) return;
          const currentPlayer = lobbyService.getPlayer(currentLobby, playerId);
          if (!currentPlayer) return;

          const srv = currentPlayer.servers.find((s) => s.name === upgServerName);
          if (!srv) return;

          srv.integrityPending = Math.max(0, (srv.integrityPending || 0) - 1);

          if (!currentPlayer.researchModule || currentPlayer.researchModule.state !== 'active') return;
          if (srv.currentIntegrity <= 0) return;

          applyIntegrityUpgrade(srv);
          io.to(currentPlayer.id).emit('upgradeApplied', { serverName: upgServerName, newIntegrityMax: srv.integrityMax });
          io.to(lobbyId).emit('gameState', { lobby: lobbyService.sanitizeLobby(currentLobby) });
        }, UPGRADE_INTEGRITY_DURATION_MS);
        return;
      }

      // ── COMMANDES AVEC CIBLE SIMPLE ───────────────────────────────────
      if (!targetName) {
        socket.emit('commandError', { message: `Usage: ${cmd} <nom_du_serveur>` });
        return;
      }

      if (cmd === 'blurchange') {
        const result = handleBlurchange(lobby, player, targetName);
        if (result.error) { socket.emit('commandError', { message: result.error, cooldown: result.cooldown }); return; }
        socket.to(socket.lobbyId).emit('blurchangeStart', { playerId: player.id, playerName: player.name, targetPlayerName: result.targetPlayerName, serverNames: result.serverNames });
        socket.emit('cooldownStart', { type: 'blurchange', duration: result.cooldownDuration });
        const lobbyId = socket.lobbyId;
        const casterId = socket.id;
        setTimeout(() => {
          io.to(lobbyId).except(casterId).emit('blurchangeEnd', { targetPlayerName: result.targetPlayerName, serverNames: result.serverNames });
        }, result.blurDuration);
        return;
      }

      let result;
      if (cmd === 'attack') {
        result = handleAttack(lobby, player, targetName);
      } else if (cmd === 'defend') {
        result = handleDefend(player, targetName);
      } else {
        socket.emit('commandError', { message: `Commande inconnue: "${cmd}". Utilisez attack, defend, blurchange, breach, research ou upgrade.` });
        return;
      }

      if (result.error) {
        socket.emit('commandError', { message: result.error, cooldown: result.cooldown });
        return;
      }

      // Mutations attack spécifiques AVANT l'émission de gameState
      if (cmd === 'attack') {
        io.to(player.id).emit('neofragUpdate', { neofrags: result.newNeofrags });
        if (result.event.newCurrentIntegrity === 0) {
          const targetPlayer = lobby.players.find((p) => p.id === result.event.targetPlayerId);
          if (targetPlayer) cancelResourcesOnServerDestroy(targetPlayer, result.event.targetServerName);
        }
      }

      // gameState après toutes les mutations
      io.to(socket.lobbyId).emit('gameEvent', result.event);
      io.to(socket.lobbyId).emit('gameState', { lobby: lobbyService.sanitizeLobby(lobby) });
      socket.emit('cooldownStart', { type: cmd, duration: result.cooldownDuration });

      if (cmd === 'attack') emitGameOver(socket.lobbyId, lobby);
    });

    // ── DISCONNECT ────────────────────────────────────────────────────────
    socket.on('disconnect', () => {
      const lobby = lobbyService.getLobby(socket.lobbyId);
      if (!lobby) return;

      if (lobby.gameStarted) {
        // Partie en cours : garder le joueur pour permettre la reconnexion
        return;
      }

      // Pré-partie : retirer le joueur normalement
      const updatedLobby = lobbyService.removePlayer(socket.lobbyId, socket.id);
      if (!updatedLobby) { clearNeofragIntervals(lobby); return; }
      io.to(socket.lobbyId).emit('playerLeft', { playerId: socket.id, lobby: lobbyService.sanitizeLobby(updatedLobby) });
    });
  });
}

module.exports = { registerSocketHandlers };

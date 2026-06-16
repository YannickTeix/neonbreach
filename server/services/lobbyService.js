const CODENAMES = require('../config/codenames');

const MAX_PLAYERS = 4;

class LobbyService {
  constructor() {
    this.lobbies = {};
  }

  generateLobbyId() {
    return Math.random().toString(36).substr(2, 4).toUpperCase();
  }

  getLobby(lobbyId) {
    return this.lobbies[lobbyId];
  }

  createLobby(socketId, playerName) {
    const lobbyId = this.generateLobbyId();
    const player = this._createPlayer(socketId, playerName);

    this.lobbies[lobbyId] = {
      id: lobbyId,
      players: [player],
      gameStarted: false,
      host: socketId,
    };

    return this.lobbies[lobbyId];
  }

  joinLobby(lobbyId, socketId, playerName) {
    const lobby = this.lobbies[lobbyId];
    if (!lobby) return { error: 'Lobby introuvable.' };
    if (lobby.gameStarted) return { error: 'La partie a déjà commencé.' };
    if (lobby.players.length >= MAX_PLAYERS) return { error: 'Lobby plein (4/4).' };

    const player = this._createPlayer(socketId, playerName);
    lobby.players.push(player);
    return { lobby, player };
  }

  startGame(lobby) {
    this._assignNamesToLobby(lobby);
    lobby.gameStarted = true;
  }

  removePlayer(lobbyId, socketId) {
    const lobby = this.lobbies[lobbyId];
    if (!lobby) return null;

    lobby.players = lobby.players.filter((p) => p.id !== socketId);

    if (lobby.players.length === 0) {
      delete this.lobbies[lobbyId];
      return null;
    }

    if (lobby.host === socketId) {
      lobby.host = lobby.players[0].id;
    }

    return lobby;
  }

  getPlayer(lobby, socketId) {
    return lobby.players.find((p) => p.id === socketId);
  }

  sanitizePlayer(player) {
    return {
      id: player.id,
      name: player.name,
      servers: player.servers,
    };
  }

  sanitizeLobby(lobby) {
    return {
      id: lobby.id,
      host: lobby.host,
      gameStarted: lobby.gameStarted,
      players: lobby.players.map((p) => this.sanitizePlayer(p)),
    };
  }

  _createPlayer(socketId, playerName) {
    return {
      id: socketId,
      name: playerName.trim().slice(0, 20),
      servers: [],
      cooldowns: { attack: 0, defend: 0 },
    };
  }

  _getUniqueServerNames(count) {
    const pool = [...CODENAMES].sort(() => Math.random() - 0.5);
    return pool.slice(0, count);
  }

  _assignNamesToLobby(lobby) {
    const totalServers = lobby.players.length * 3;
    const names = this._getUniqueServerNames(totalServers);
    lobby.players.forEach((player, i) => {
      player.servers = names.slice(i * 3, i * 3 + 3).map((name) => ({ name, health: 100 }));
    });
  }
}

module.exports = { LobbyService, MAX_PLAYERS };

const BREACHER_NAMES = require('../config/breacherNames');

const BREACH_PREPARE_COST = 10;
const BREACH_CONNECT_COST = 15;
const BREACH_PREPARE_DURATION_MS = 12000;

function generateBreacherName(lobby) {
  const used = new Set();
  for (const p of lobby.players) {
    for (const b of (p.breachers || [])) {
      if (b.name) used.add(b.name);
    }
  }
  const available = BREACHER_NAMES.filter((n) => !used.has(n));
  const pool = available.length > 0 ? available : BREACHER_NAMES;
  return pool[Math.floor(Math.random() * pool.length)];
}

function handleBreachPrepare(lobby, player, serverName) {
  if (player.neofrags < BREACH_PREPARE_COST) {
    return { error: `Neofrags insuffisants — ${player.neofrags}/${BREACH_PREPARE_COST} requis.` };
  }
  const server = player.servers.find((s) => s.name === serverName && s.currentIntegrity > 0);
  if (!server) {
    const alive = player.servers.filter((s) => s.currentIntegrity > 0).map((s) => s.name);
    return { error: `Serveur "${serverName}" introuvable. Disponibles: ${alive.join(', ') || 'aucun'}` };
  }
  const existing = (player.breachers || []).find(
    (b) => b.sourceServer === serverName && b.state !== 'disconnected'
  );
  if (existing) {
    return { error: `Brècheur déjà actif sur ${serverName}.` };
  }

  player.neofrags -= BREACH_PREPARE_COST;
  if (!player.breachers) player.breachers = [];

  const breachId = `${player.id.slice(-4)}-${Date.now().toString(36)}`;
  player.breachers.push({
    id: breachId,
    name: null,
    sourceServer: serverName,
    state: 'preparing',
    connectedPlayerId: null,
    connectedPlayerName: null,
  });

  return {
    breachId,
    sourceServer: serverName,
    neofrags: player.neofrags,
    duration: BREACH_PREPARE_DURATION_MS,
  };
}

function handleBreachConnect(lobby, player, breacherName, targetPlayerName) {
  if (player.neofrags < BREACH_CONNECT_COST) {
    return { error: `Neofrags insuffisants — ${player.neofrags}/${BREACH_CONNECT_COST} requis.` };
  }
  const breacher = (player.breachers || []).find(
    (b) => b.name === breacherName && b.state === 'ready'
  );
  if (!breacher) {
    const ready = (player.breachers || []).filter((b) => b.state === 'ready').map((b) => b.name);
    return { error: `Brècheur "${breacherName}" non trouvé ou non prêt. Disponibles: ${ready.join(', ') || 'aucun'}` };
  }
  const targetPlayer = lobby.players.find(
    (p) => p.id !== player.id && p.name.toUpperCase() === targetPlayerName
  );
  if (!targetPlayer) {
    const opponents = lobby.players.filter((p) => p.id !== player.id).map((p) => p.name);
    return { error: `Joueur "${targetPlayerName}" introuvable. Adversaires: ${opponents.join(', ')}` };
  }
  if (!targetPlayer.servers.some((s) => s.currentIntegrity > 0)) {
    return { error: `${targetPlayer.name} n'a plus de serveurs actifs.` };
  }

  player.neofrags -= BREACH_CONNECT_COST;
  breacher.state = 'connected';
  breacher.connectedPlayerId = targetPlayer.id;
  breacher.connectedPlayerName = targetPlayer.name;

  return {
    breacherId: breacher.id,
    breacherName: breacher.name,
    sourceServer: breacher.sourceServer,
    targetPlayerId: targetPlayer.id,
    targetPlayerName: targetPlayer.name,
    neofrags: player.neofrags,
  };
}

module.exports = {
  generateBreacherName,
  handleBreachPrepare,
  handleBreachConnect,
  BREACH_PREPARE_COST,
  BREACH_CONNECT_COST,
  BREACH_PREPARE_DURATION_MS,
};

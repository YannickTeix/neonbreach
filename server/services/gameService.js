const BREACHER_NAMES = require('../config/breacherNames');

const ATTACK_COOLDOWN_MS = 3000;
const ATTACK_MAX_NEOFRAGS = 30;
const DEFEND_HEAL = 15;
const DEFEND_COOLDOWN_MS = 5000;
const BLURCHANGE_COOLDOWN_MS = 40000;
const BLURCHANGE_DURATION_MS = 15000;
const BREACH_PREPARE_COST = 10;
const BREACH_CONNECT_COST = 15;
const BREACH_PREPARE_DURATION_MS = 12000;

function checkWinCondition(lobby) {
  const alive = lobby.players.filter((p) => p.servers && p.servers.some((s) => s.currentIntegrity > 0));
  if (alive.length === 1 && lobby.players.length > 1) return alive[0];
  if (alive.length === 0) return 'draw';
  return null;
}

function parseCommand(command) {
  const parts = command.trim().split(/\s+/);
  const cmd = parts[0]?.toLowerCase();
  const targetName = parts.slice(1).join(' ').toUpperCase().trim();
  return { cmd, targetName };
}

function handleAttack(lobby, attacker, targetName) {
  const now = Date.now();

  if (now < attacker.cooldowns.attack) {
    const rem = ((attacker.cooldowns.attack - now) / 1000).toFixed(1);
    return { error: `⏱ Cooldown attack: ${rem}s restantes`, cooldown: true };
  }

  // Parse "SERVERNAME AMOUNT"
  const nameParts = targetName.split(/\s+/);
  const serverName = nameParts[0];
  const amountStr = nameParts[1];
  const neofragAmount = parseInt(amountStr, 10);

  if (!amountStr || isNaN(neofragAmount) || neofragAmount < 1) {
    return { error: 'Usage: attack <nomServeur> <neofrags> (ex: attack NEXUS 20)' };
  }
  if (neofragAmount > ATTACK_MAX_NEOFRAGS) {
    return { error: `Maximum ${ATTACK_MAX_NEOFRAGS} neofrags par attaque.` };
  }
  if (attacker.neofrags < neofragAmount) {
    return { error: `Neofrags insuffisants — ${attacker.neofrags}/${neofragAmount} requis.` };
  }

  let targetPlayer = null;
  let targetServer = null;

  for (const p of lobby.players) {
    if (p.id === attacker.id) continue;
    const s = p.servers.find((srv) => srv.name === serverName && srv.currentIntegrity > 0);
    if (s) { targetPlayer = p; targetServer = s; break; }
  }

  if (!targetServer) {
    const allEnemyServers = lobby.players
      .filter((p) => p.id !== attacker.id)
      .flatMap((p) => p.servers.filter((s) => s.currentIntegrity > 0).map((s) => s.name));
    return {
      error: `Serveur "${serverName}" introuvable ou détruit. Serveurs disponibles: ${allEnemyServers.join(', ') || 'aucun'}`,
    };
  }

  const breacher = (attacker.breachers || []).find(
    (b) => b.state === 'connected' && b.connectedPlayerId === targetPlayer.id
  );
  if (!breacher) {
    return {
      error: `Brèche requise — utilisez "breach connect" pour cibler ${targetPlayer.name} avant d'attaquer.`,
    };
  }

  const sourceServer = attacker.servers.find((s) => s.name === breacher.sourceServer);
  const coresMultiplier = (sourceServer && sourceServer.processingCores) ? sourceServer.processingCores : 1;
  const damage = Math.min(neofragAmount * coresMultiplier, targetServer.currentIntegrity);

  attacker.neofrags -= neofragAmount;
  targetServer.currentIntegrity = Math.max(0, targetServer.currentIntegrity - damage);
  attacker.cooldowns.attack = now + ATTACK_COOLDOWN_MS;

  return {
    event: {
      type: 'attack',
      attackerId: attacker.id,
      attackerName: attacker.name,
      targetPlayerId: targetPlayer.id,
      targetPlayerName: targetPlayer.name,
      targetServerName: targetServer.name,
      damage,
      newCurrentIntegrity: targetServer.currentIntegrity,
      neofragsConsumed: neofragAmount,
      coresMultiplier,
    },
    newNeofrags: attacker.neofrags,
    cooldownDuration: ATTACK_COOLDOWN_MS,
  };
}

function handleDefend(player, targetName) {
  const now = Date.now();

  if (now < player.cooldowns.defend) {
    const rem = ((player.cooldowns.defend - now) / 1000).toFixed(1);
    return { error: `⏱ Cooldown defend: ${rem}s restantes`, cooldown: true };
  }

  const targetServer = player.servers.find((s) => s.name === targetName);

  if (!targetServer) {
    const myServers = player.servers.map((s) => s.name).join(', ');
    return { error: `Serveur "${targetName}" introuvable. Vos serveurs: ${myServers}` };
  }

  if (targetServer.currentIntegrity === 0) {
    return { error: `"${targetName}" est détruit, impossible de le défendre.` };
  }

  targetServer.currentIntegrity = Math.min(100, targetServer.currentIntegrity + DEFEND_HEAL);
  player.cooldowns.defend = now + DEFEND_COOLDOWN_MS;

  return {
    event: {
      type: 'defend',
      playerId: player.id,
      playerName: player.name,
      targetServerName: targetServer.name,
      heal: DEFEND_HEAL,
      newCurrentIntegrity: targetServer.currentIntegrity,
    },
    cooldownDuration: DEFEND_COOLDOWN_MS,
  };
}

function handleBlurchange(lobby, player, targetPlayerName) {
  const now = Date.now();
  if (!player.cooldowns.blurchange) player.cooldowns.blurchange = 0;

  if (now < player.cooldowns.blurchange) {
    const rem = ((player.cooldowns.blurchange - now) / 1000).toFixed(1);
    return { error: `⏱ Cooldown blurchange: ${rem}s restantes`, cooldown: true };
  }

  // targetPlayerName est déjà en majuscules (parseCommand uppercases)
  const targetPlayer = lobby.players.find(
    (p) => p.name.toUpperCase() === targetPlayerName
  );

  if (!targetPlayer) {
    const allNames = lobby.players.map((p) => p.name);
    return {
      error: `Joueur "${targetPlayerName}" introuvable. Joueurs: ${allNames.join(', ') || 'aucun'}`,
    };
  }

  const liveServers = targetPlayer.servers.filter((s) => s.currentIntegrity > 0);
  if (liveServers.length === 0) {
    return { error: `${targetPlayer.name} n'a plus de serveurs actifs.` };
  }

  player.cooldowns.blurchange = now + BLURCHANGE_COOLDOWN_MS;

  return {
    targetPlayerName: targetPlayer.name,
    serverNames: liveServers.map((s) => s.name),
    cooldownDuration: BLURCHANGE_COOLDOWN_MS,
    blurDuration: BLURCHANGE_DURATION_MS,
  };
}

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
  checkWinCondition,
  parseCommand,
  handleAttack,
  handleDefend,
  handleBlurchange,
  handleBreachPrepare,
  handleBreachConnect,
  generateBreacherName,
  BREACH_PREPARE_DURATION_MS,
};

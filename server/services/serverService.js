const ATTACK_COOLDOWN_MS = 3000;
const ATTACK_MAX_NEOFRAGS = 30;
const DEFEND_HEAL = 15;
const DEFEND_COOLDOWN_MS = 5000;
const UPGRADE_INTEGRITY_COST = 30;
const UPGRADE_INTEGRITY_AMOUNT = 20;
const UPGRADE_INTEGRITY_DURATION_MS = 8000;
const UPGRADE_INTEGRITY_MAX_COUNT = 3;

function checkWinCondition(lobby) {
  const alive = lobby.players.filter((p) => p.servers && p.servers.some((s) => s.currentIntegrity > 0));
  if (alive.length === 1 && lobby.players.length > 1) return alive[0];
  if (alive.length === 0) return 'draw';
  return null;
}

function handleAttack(lobby, attacker, targetName) {
  const now = Date.now();

  if (now < attacker.cooldowns.attack) {
    const rem = ((attacker.cooldowns.attack - now) / 1000).toFixed(1);
    return { error: `⏱ Cooldown attack: ${rem}s restantes`, cooldown: true };
  }

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

function handleUpgradeIntegrity(player, serverName) {
  if (!player.researchModule || player.researchModule.state !== 'active') {
    return { error: 'Module de recherche actif requis pour utiliser upgrade.' };
  }
  if (player.neofrags < UPGRADE_INTEGRITY_COST) {
    return { error: `Neofrags insuffisants — ${player.neofrags}/${UPGRADE_INTEGRITY_COST} requis.` };
  }
  const server = player.servers.find((s) => s.name === serverName && s.currentIntegrity > 0);
  if (!server) {
    const alive = player.servers.filter((s) => s.currentIntegrity > 0).map((s) => s.name);
    return { error: `Serveur "${serverName}" introuvable. Disponibles: ${alive.join(', ') || 'aucun'}` };
  }
  const totalBoosts = (server.integrityUpgrades || 0) + (server.integrityPending || 0);
  if (totalBoosts >= UPGRADE_INTEGRITY_MAX_COUNT) {
    return { error: `Limite atteinte — ${UPGRADE_INTEGRITY_MAX_COUNT} upgrades max par serveur.` };
  }

  player.neofrags -= UPGRADE_INTEGRITY_COST;
  server.integrityPending = (server.integrityPending || 0) + 1;

  return { serverName, neofrags: player.neofrags, duration: UPGRADE_INTEGRITY_DURATION_MS };
}

function applyIntegrityUpgrade(server) {
  server.integrityMax += UPGRADE_INTEGRITY_AMOUNT;
  server.integrityUpgrades = (server.integrityUpgrades || 0) + 1;
  server.integrityPending = Math.max(0, (server.integrityPending || 0) - 1);
}

function resetIntegrityUpgrades(player) {
  for (const server of player.servers) {
    if ((server.integrityUpgrades || 0) > 0 || (server.integrityPending || 0) > 0) {
      if (server.currentIntegrity > 100) server.currentIntegrity = 100;
      server.integrityMax = 100;
      server.integrityUpgrades = 0;
      server.integrityPending = 0;
    }
  }
}

module.exports = {
  checkWinCondition,
  handleAttack,
  handleDefend,
  handleUpgradeIntegrity,
  applyIntegrityUpgrade,
  resetIntegrityUpgrades,
  ATTACK_COOLDOWN_MS,
  ATTACK_MAX_NEOFRAGS,
  DEFEND_HEAL,
  DEFEND_COOLDOWN_MS,
  UPGRADE_INTEGRITY_COST,
  UPGRADE_INTEGRITY_DURATION_MS,
  UPGRADE_INTEGRITY_MAX_COUNT,
};

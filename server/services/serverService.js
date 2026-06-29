const ATTACK_COOLDOWN_MS = 3000;
const ATTACK_MAX_NEOFRAGS = 30;
const DEFEND_HEAL = 15;
const DEFEND_COOLDOWN_MS = 5000;

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

module.exports = {
  checkWinCondition,
  handleAttack,
  handleDefend,
  ATTACK_COOLDOWN_MS,
  ATTACK_MAX_NEOFRAGS,
  DEFEND_HEAL,
  DEFEND_COOLDOWN_MS,
};

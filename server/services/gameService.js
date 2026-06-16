const ATTACK_DAMAGE = 20;
const ATTACK_COOLDOWN_MS = 3000;
const DEFEND_HEAL = 15;
const DEFEND_COOLDOWN_MS = 5000;

function checkWinCondition(lobby) {
  const alive = lobby.players.filter((p) => p.servers && p.servers.some((s) => s.health > 0));
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

  let targetPlayer = null;
  let targetServer = null;

  for (const p of lobby.players) {
    if (p.id === attacker.id) continue;
    const s = p.servers.find((srv) => srv.name === targetName && srv.health > 0);
    if (s) { targetPlayer = p; targetServer = s; break; }
  }

  if (!targetServer) {
    const allEnemyServers = lobby.players
      .filter((p) => p.id !== attacker.id)
      .flatMap((p) => p.servers.filter((s) => s.health > 0).map((s) => s.name));
    return {
      error: `Serveur "${targetName}" introuvable ou détruit. Serveurs disponibles: ${allEnemyServers.join(', ') || 'aucun'}`,
    };
  }

  targetServer.health = Math.max(0, targetServer.health - ATTACK_DAMAGE);
  attacker.cooldowns.attack = now + ATTACK_COOLDOWN_MS;

  return {
    event: {
      type: 'attack',
      attackerId: attacker.id,
      attackerName: attacker.name,
      targetPlayerId: targetPlayer.id,
      targetPlayerName: targetPlayer.name,
      targetServerName: targetServer.name,
      damage: ATTACK_DAMAGE,
      newHealth: targetServer.health,
    },
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

  if (targetServer.health === 0) {
    return { error: `"${targetName}" est détruit, impossible de le défendre.` };
  }

  targetServer.health = Math.min(100, targetServer.health + DEFEND_HEAL);
  player.cooldowns.defend = now + DEFEND_COOLDOWN_MS;

  return {
    event: {
      type: 'defend',
      playerId: player.id,
      playerName: player.name,
      targetServerName: targetServer.name,
      heal: DEFEND_HEAL,
      newHealth: targetServer.health,
    },
    cooldownDuration: DEFEND_COOLDOWN_MS,
  };
}

module.exports = { checkWinCondition, parseCommand, handleAttack, handleDefend };

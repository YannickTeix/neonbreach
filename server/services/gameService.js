const { checkWinCondition, handleAttack, handleDefend, handleUpgradeIntegrity, applyIntegrityUpgrade, resetIntegrityUpgrades, ATTACK_COOLDOWN_MS, ATTACK_MAX_NEOFRAGS, DEFEND_HEAL, DEFEND_COOLDOWN_MS, UPGRADE_INTEGRITY_DURATION_MS, UPGRADE_INTEGRITY_MAX_COUNT } = require('./serverService');
const { generateBreacherName, handleBreachPrepare, handleBreachConnect, BREACH_PREPARE_COST, BREACH_CONNECT_COST, BREACH_PREPARE_DURATION_MS } = require('./breachService');
const { handleResearchPrepare, handleResearchUpload, RESEARCH_PREPARE_DURATION_MS } = require('./researchService');

const BLURCHANGE_COOLDOWN_MS = 40000;
const BLURCHANGE_DURATION_MS = 15000;

function parseCommand(command) {
  const parts = command.trim().split(/\s+/);
  const cmd = parts[0]?.toLowerCase();
  const targetName = parts.slice(1).join(' ').toUpperCase().trim();
  return { cmd, targetName };
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

module.exports = {
  checkWinCondition,
  parseCommand,
  handleAttack,
  handleDefend,
  handleBlurchange,
  handleBreachPrepare,
  handleBreachConnect,
  generateBreacherName,
  handleResearchPrepare,
  handleResearchUpload,
  handleUpgradeIntegrity,
  applyIntegrityUpgrade,
  resetIntegrityUpgrades,
  BREACH_PREPARE_DURATION_MS,
  RESEARCH_PREPARE_DURATION_MS,
  UPGRADE_INTEGRITY_DURATION_MS,
  UPGRADE_INTEGRITY_MAX_COUNT,
};

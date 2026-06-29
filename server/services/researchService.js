const RESEARCH_PREPARE_COST = 15;
const RESEARCH_PREPARE_DURATION_MS = 15000;

// Neofrags requis pour passer du niveau N au niveau N+1 (index = niveau actuel - 1)
const RESEARCH_LEVEL_THRESHOLDS = [100, 128, 256, 512];

const MAX_RESEARCH_LEVEL = 5;

function getNeofragsToNextLevel(level) {
  return RESEARCH_LEVEL_THRESHOLDS[level - 1] ?? null;
}

function handleResearchPrepare(player, serverName) {
  if (player.researchModule) {
    return { error: 'Module de recherche déjà actif ou en préparation.' };
  }
  if (player.neofrags < RESEARCH_PREPARE_COST) {
    return { error: `Neofrags insuffisants — ${player.neofrags}/${RESEARCH_PREPARE_COST} requis.` };
  }
  const server = player.servers.find((s) => s.name === serverName && s.currentIntegrity > 0);
  if (!server) {
    const alive = player.servers.filter((s) => s.currentIntegrity > 0).map((s) => s.name);
    return { error: `Serveur "${serverName}" introuvable. Disponibles: ${alive.join(', ') || 'aucun'}` };
  }

  player.neofrags -= RESEARCH_PREPARE_COST;
  player.researchModule = {
    state: 'preparing',
    sourceServer: serverName,
    level: 1,
    neofrags: 0,
    neofragsToNextLevel: RESEARCH_LEVEL_THRESHOLDS[0],
  };

  return {
    sourceServer: serverName,
    duration: RESEARCH_PREPARE_DURATION_MS,
    neofrags: player.neofrags,
  };
}

function handleResearchUpload(player, amountStr) {
  const amount = parseInt(amountStr, 10);
  if (isNaN(amount) || amount < 1) {
    return { error: 'Usage: research upload <nbNeofrags>' };
  }
  if (!player.researchModule || player.researchModule.state !== 'active') {
    return { error: 'Aucun module de recherche actif.' };
  }
  if (player.researchModule.level >= MAX_RESEARCH_LEVEL) {
    return { error: 'Module de recherche au niveau maximum.' };
  }
  if (player.neofrags < amount) {
    return { error: `Neofrags insuffisants — ${player.neofrags}/${amount} requis.` };
  }

  player.neofrags -= amount;
  player.researchModule.neofrags += amount;

  // Montée de niveau en cascade
  while (
    player.researchModule.level < MAX_RESEARCH_LEVEL &&
    player.researchModule.neofrags >= player.researchModule.neofragsToNextLevel
  ) {
    player.researchModule.neofrags -= player.researchModule.neofragsToNextLevel;
    player.researchModule.level += 1;
    player.researchModule.neofragsToNextLevel = getNeofragsToNextLevel(player.researchModule.level);
  }

  return {
    module: { ...player.researchModule },
    neofrags: player.neofrags,
  };
}

module.exports = {
  handleResearchPrepare,
  handleResearchUpload,
  RESEARCH_PREPARE_COST,
  RESEARCH_PREPARE_DURATION_MS,
  RESEARCH_LEVEL_THRESHOLDS,
  MAX_RESEARCH_LEVEL,
};

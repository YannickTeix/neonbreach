export interface ServerInfo {
  name: string;
  currentIntegrity: number;
  integrityMax: number;
  integrityUpgrades: number;
  neofragGain: number;
  neofragFreq: number;
  processingCores: number;
}

export interface Player {
  id: string;
  name: string;
  servers: ServerInfo[];
}

export interface Lobby {
  id: string;
  host: string;
  gameStarted: boolean;
  players: Player[];
}

export interface AttackEvent {
  type: 'attack';
  attackerId: string;
  attackerName: string;
  targetPlayerId: string;
  targetPlayerName: string;
  targetServerName: string;
  damage: number;
  newCurrentIntegrity: number;
  neofragsConsumed: number;
  coresMultiplier: number;
}

export interface DefendEvent {
  type: 'defend';
  playerId: string;
  playerName: string;
  targetServerName: string;
  heal: number;
  newCurrentIntegrity: number;
}

export type GameEvent = AttackEvent | DefendEvent;

export interface LogEntry {
  time: string;
  msg: string;
  cls: string;
}

export interface CooldownState {
  end: number;
  duration: number;
}

export interface GameOverInfo {
  winner: Player | null;
  draw: boolean;
}

export interface BlurchangeStartPayload {
  playerId: string;
  playerName: string;
  targetPlayerName: string;
  serverNames: string[];
}

export interface BlurchangeEndPayload {
  targetPlayerName: string;
  serverNames: string[];
}

export interface Breacher {
  id: string;
  name: string | null;
  sourceServer: string;
  state: 'preparing' | 'ready' | 'connected';
  connectedPlayerId: string | null;
  connectedPlayerName: string | null;
}

export interface BreachPreparingPayload {
  breachId: string;
  sourceServer: string;
  duration: number;
}

export interface BreachReadyPayload {
  breachId: string;
  sourceServer: string;
  breacherName: string;
}

export interface BreachConnectedPayload {
  breacherId: string;
  breacherName: string;
  sourceServer: string;
  targetPlayerId: string;
  targetPlayerName: string;
}

export interface BreachCancelledPayload {
  breachId: string;
  reason: string;
}

export interface ResearchModule {
  state: 'preparing' | 'active';
  sourceServer: string;
  level: number;
  neofrags: number;
  neofragsToNextLevel: number | null;
}

export interface ResearchPreparingPayload {
  sourceServer: string;
  duration: number;
}

export interface ResearchReadyPayload {
  sourceServer: string;
}

export interface ResearchUpdatedPayload {
  module: ResearchModule;
}

export interface ResearchCancelledPayload {
  reason: string;
}

export interface UpgradePreparingPayload {
  serverName: string;
  duration: number;
}

export interface UpgradeAppliedPayload {
  serverName: string;
  newIntegrityMax: number;
}

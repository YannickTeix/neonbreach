export interface ServerInfo {
  name: string;
  health: number;
  neofragGain: number;
  neofragFreq: number;
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
  newHealth: number;
}

export interface DefendEvent {
  type: 'defend';
  playerId: string;
  playerName: string;
  targetServerName: string;
  heal: number;
  newHealth: number;
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

export interface ServerInfo {
  name: string;
  health: number;
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

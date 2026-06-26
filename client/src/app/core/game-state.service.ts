import { Injectable, computed, signal } from '@angular/core';
import { SocketService } from './socket.service';
import { escapeHtml, getTime } from './health.util';
import { BlurchangeEndPayload, BlurchangeStartPayload, GameEvent, GameOverInfo, Lobby, LogEntry, Player } from './models';

export type Screen = 'home' | 'lobby' | 'game';

interface LobbyCreatedPayload { lobbyId: string; playerId: string; lobby: Lobby; }
interface LobbyJoinedPayload { playerId: string; lobby: Lobby; }
interface LobbyPayload { lobby: Lobby; }
interface PlayerLeftPayload { playerId: string; lobby: Lobby; }
interface GameOverPayload { winner: Player | null; draw: boolean; }
interface CooldownStartPayload { type: 'attack' | 'defend' | 'blurchange'; duration: number; }
interface CommandErrorPayload { message: string; cooldown?: boolean; }
interface ErrorPayload { message: string; }

@Injectable({ providedIn: 'root' })
export class GameStateService {
  readonly screen = signal<Screen>('home');
  readonly myPlayerId = signal<string | null>(null);
  readonly lobby = signal<Lobby | null>(null);
  readonly homeError = signal<string | null>(null);
  readonly commandFeedback = signal<string>('');
  readonly gameOverInfo = signal<GameOverInfo | null>(null);
  readonly eventLog = signal<LogEntry[]>([
    { time: getTime(), msg: 'Système initialisé. Bonne chance, soldat.', cls: 'log-system' },
  ]);
  readonly lastGameEvent = signal<{ event: GameEvent; seq: number } | null>(null);
  readonly cooldownStart = signal<CooldownStartPayload | null>(null);
  readonly blurredServers = signal<ReadonlySet<string>>(new Set());
  readonly myNeofrags = signal<number>(0);

  readonly isHost = computed(() => {
    const l = this.lobby();
    return !!l && l.host === this.myPlayerId();
  });

  readonly myPlayer = computed(() => {
    const l = this.lobby();
    return l?.players.find((p) => p.id === this.myPlayerId()) ?? null;
  });

  readonly opponents = computed(() => {
    const l = this.lobby();
    return l?.players.filter((p) => p.id !== this.myPlayerId()) ?? [];
  });

  private eventSeq = 0;
  private homeErrorTimeout?: ReturnType<typeof setTimeout>;
  private feedbackTimeout?: ReturnType<typeof setTimeout>;

  constructor(private socket: SocketService) {
    this.socket.on<LobbyCreatedPayload>('lobbyCreated').subscribe(({ playerId, lobby }) => {
      this.myPlayerId.set(playerId);
      this.lobby.set(lobby);
      this.screen.set('lobby');
    });

    this.socket.on<LobbyJoinedPayload>('lobbyJoined').subscribe(({ playerId, lobby }) => {
      this.myPlayerId.set(playerId);
      this.lobby.set(lobby);
      this.screen.set('lobby');
    });

    this.socket.on<LobbyPayload>('playerJoined').subscribe(({ lobby }) => {
      this.lobby.set(lobby);
    });

    this.socket.on<PlayerLeftPayload>('playerLeft').subscribe(({ lobby }) => {
      this.lobby.set(lobby);
      if (this.screen() === 'game') {
        this.addLog('Un joueur a quitté la partie.', 'log-system');
      }
    });

    this.socket.on<LobbyPayload>('gameStarted').subscribe(({ lobby }) => {
      this.lobby.set(lobby);
      this.myNeofrags.set(0);
      this.screen.set('game');
      this.addLog('Partie commencée ! Bonne chance.', 'log-system');
    });

    this.socket.on<LobbyPayload>('gameState').subscribe(({ lobby }) => {
      this.lobby.set(lobby);
    });

    this.socket.on<GameEvent>('gameEvent').subscribe((event) => {
      this.eventSeq++;
      this.lastGameEvent.set({ event, seq: this.eventSeq });
      this.logGameEvent(event);
    });

    this.socket.on<GameOverPayload>('gameOver').subscribe(({ winner, draw }) => {
      this.gameOverInfo.set({ winner, draw });
      if (draw) {
        this.addLog('Égalité. Tous les serveurs sont tombés simultanément.', 'log-system');
      } else if (winner?.id === this.myPlayerId()) {
        this.addLog('⬡ VICTOIRE ! Vous êtes le dernier debout.', 'log-win');
      } else {
        this.addLog(`✕ Défaite. ${escapeHtml(winner?.name ?? '???')} a gagné.`, 'log-attack');
      }
    });

    this.socket.on<CooldownStartPayload>('cooldownStart').subscribe((payload) => {
      this.cooldownStart.set(payload);
    });

    this.socket.on<BlurchangeStartPayload>('blurchangeStart').subscribe(({ playerId, playerName, targetPlayerName, serverNames }) => {
      this.blurredServers.update((set) => new Set([...set, ...serverNames]));
      const who = playerId === this.myPlayerId() ? 'Vous avez' : `${escapeHtml(playerName)} a`;
      this.addLog(`${who} brouillé les serveurs de <b>${escapeHtml(targetPlayerName)}</b> pendant 20s`, 'log-blur');
    });

    this.socket.on<BlurchangeEndPayload>('blurchangeEnd').subscribe(({ targetPlayerName, serverNames }) => {
      this.blurredServers.update((set) => {
        const next = new Set(set);
        serverNames.forEach((n) => next.delete(n));
        return next;
      });
      this.addLog(`Serveurs de <b>${escapeHtml(targetPlayerName)}</b> — identité restaurée`, 'log-system');
    });

    this.socket.on<{ neofrags: number }>('neofragUpdate').subscribe(({ neofrags }) => {
      this.myNeofrags.set(neofrags);
    });

    this.socket.on<CommandErrorPayload>('commandError').subscribe(({ message }) => {
      this.setCommandFeedback(message);
    });

    this.socket.on<ErrorPayload>('error').subscribe(({ message }) => {
      this.setHomeError(message);
    });

    this.socket.on<void>('disconnect').subscribe(() => {
      this.setHomeError('Connexion perdue avec le serveur.');
    });
  }

  createLobby(playerName: string): void {
    if (!playerName.trim()) {
      this.setHomeError('Entrez un nom de joueur.');
      return;
    }
    this.socket.emit('createLobby', { playerName });
  }

  joinLobby(playerName: string, lobbyId: string): void {
    if (!playerName.trim()) {
      this.setHomeError('Entrez un nom de joueur.');
      return;
    }
    if (!lobbyId.trim()) {
      this.setHomeError('Entrez un code de lobby.');
      return;
    }
    this.socket.emit('joinLobby', { lobbyId: lobbyId.toUpperCase(), playerName });
  }

  startGame(): void {
    this.socket.emit('startGame');
  }

  sendCommand(command: string): void {
    this.socket.emit('command', { command });
    this.commandFeedback.set('');
  }

  setHomeError(message: string): void {
    this.homeError.set(message);
    if (this.homeErrorTimeout) clearTimeout(this.homeErrorTimeout);
    this.homeErrorTimeout = setTimeout(() => this.homeError.set(null), 4000);
  }

  setCommandFeedback(message: string): void {
    this.commandFeedback.set(message);
    if (this.feedbackTimeout) clearTimeout(this.feedbackTimeout);
    this.feedbackTimeout = setTimeout(() => this.commandFeedback.set(''), 3000);
  }

  private addLog(msg: string, cls: string): void {
    this.eventLog.update((log) => [...log, { time: getTime(), msg, cls }]);
  }

  private logGameEvent(ev: GameEvent): void {
    if (ev.type === 'attack') {
      const who = ev.attackerId === this.myPlayerId() ? 'Vous avez attaqué' : `${escapeHtml(ev.attackerName)} attaque`;
      const target = ev.targetPlayerId === this.myPlayerId() ? 'votre' : 'le';
      this.addLog(
        `${who} ${target} serveur <b>${escapeHtml(ev.targetServerName)}</b> (${escapeHtml(ev.targetPlayerName)}) — -20% → ${ev.newHealth}%`,
        'log-attack'
      );
      if (ev.newHealth <= 0) {
        setTimeout(() => this.addLog(`⚠ Serveur <b>${escapeHtml(ev.targetServerName)}</b> DÉTRUIT !`, 'log-destroy'), 500);
      }
    } else {
      const who = ev.playerId === this.myPlayerId() ? 'Vous avez défendu' : `${escapeHtml(ev.playerName)} défend`;
      this.addLog(`${who} <b>${escapeHtml(ev.targetServerName)}</b> — +15% → ${ev.newHealth}%`, 'log-defend');
    }
  }
}

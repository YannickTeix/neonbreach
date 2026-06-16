import { CommonModule } from '@angular/common';
import { Component, computed, inject } from '@angular/core';
import { GameStateService } from '../../core/game-state.service';
import { Player } from '../../core/models';
import { LobbyPlayerSlotComponent } from './lobby-player-slot/lobby-player-slot.component';

@Component({
  selector: 'app-lobby-screen',
  standalone: true,
  imports: [CommonModule, LobbyPlayerSlotComponent],
  templateUrl: './lobby-screen.component.html',
})
export class LobbyScreenComponent {
  readonly state = inject(GameStateService);

  readonly slots = computed<(Player | null)[]>(() => {
    const players = this.state.lobby()?.players ?? [];
    const slots: (Player | null)[] = [...players];
    while (slots.length < 4) slots.push(null);
    return slots;
  });

  readonly playerCount = computed(() => this.state.lobby()?.players.length ?? 0);

  readonly hint = computed(() => {
    const count = this.playerCount();
    if (count < 2) return `En attente de joueurs... (${count}/4, min 2)`;
    if (!this.state.isHost()) return `En attente du démarrage par l'hôte...`;
    return `${count} joueur${count > 1 ? 's' : ''} connecté${count > 1 ? 's' : ''}. Prêt à démarrer !`;
  });

  copyCode(): void {
    const code = this.state.lobby()?.id ?? '';
    navigator.clipboard.writeText(code).catch(() => {});
  }

  startGame(): void {
    this.state.startGame();
  }

  leave(): void {
    location.reload();
  }
}

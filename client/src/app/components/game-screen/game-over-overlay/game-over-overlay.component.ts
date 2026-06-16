import { CommonModule } from '@angular/common';
import { Component, computed, inject } from '@angular/core';
import { GameStateService } from '../../../core/game-state.service';

@Component({
  selector: 'app-game-over-overlay',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './game-over-overlay.component.html',
})
export class GameOverOverlayComponent {
  readonly state = inject(GameStateService);

  readonly title = computed(() => {
    const info = this.state.gameOverInfo();
    if (!info) return '';
    if (info.draw) return 'ÉGALITÉ';
    return info.winner?.id === this.state.myPlayerId() ? 'VICTOIRE !' : 'DÉFAITE';
  });

  readonly titleColor = computed(() => {
    const info = this.state.gameOverInfo();
    if (!info) return '';
    if (info.draw) return 'var(--orange)';
    return info.winner?.id === this.state.myPlayerId() ? 'var(--neon)' : 'var(--red)';
  });

  readonly message = computed(() => {
    const info = this.state.gameOverInfo();
    if (!info) return '';
    if (info.draw) return 'Tous les serveurs sont tombés simultanément.';
    if (info.winner?.id === this.state.myPlayerId()) return 'Vos serveurs tiennent encore. La guerre est gagnée.';
    return `${info.winner?.name ?? '???'} remporte la partie.`;
  });

  playAgain(): void {
    location.reload();
  }
}

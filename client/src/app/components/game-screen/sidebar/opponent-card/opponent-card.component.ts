import { CommonModule } from '@angular/common';
import { Component, Input, computed, inject } from '@angular/core';
import { GameStateService } from '../../../../core/game-state.service';
import { integrityColor } from '../../../../core/health.util';
import { Player } from '../../../../core/models';

@Component({
  selector: 'app-opponent-card',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './opponent-card.component.html',
})
export class OpponentCardComponent {
  @Input({ required: true }) player!: Player;

  readonly state = inject(GameStateService);

  readonly eliminated = computed(() =>
    this.player.servers.length > 0 && !this.player.servers.some((s) => s.currentIntegrity > 0)
  );

  readonly hasBreach = computed(() =>
    this.state.myBreachers().some((b) => b.state === 'connected' && b.connectedPlayerId === this.player.id)
  );

  integrityColor(val: number): string {
    return integrityColor(val);
  }

  isBlurred(serverName: string): boolean {
    return this.state.blurredServers().has(serverName);
  }
}

import { CommonModule } from '@angular/common';
import { Component, Input, computed, inject } from '@angular/core';
import { GameStateService } from '../../../../core/game-state.service';
import { healthColor } from '../../../../core/health.util';
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

  readonly eliminated = computed(() => !this.player.servers.some((s) => s.health > 0));

  healthColor(hp: number): string {
    return healthColor(hp);
  }

  isBlurred(serverName: string): boolean {
    return this.state.blurredServers().has(serverName);
  }
}

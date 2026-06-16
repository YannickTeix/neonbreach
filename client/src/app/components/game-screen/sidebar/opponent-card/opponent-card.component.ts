import { CommonModule } from '@angular/common';
import { Component, Input, computed } from '@angular/core';
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

  readonly eliminated = computed(() => !this.player.servers.some((s) => s.health > 0));

  healthColor(hp: number): string {
    return healthColor(hp);
  }
}

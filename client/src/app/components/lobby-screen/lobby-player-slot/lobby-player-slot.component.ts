import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';
import { Player } from '../../../core/models';

@Component({
  selector: 'app-lobby-player-slot',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './lobby-player-slot.component.html',
})
export class LobbyPlayerSlotComponent {
  @Input() player: Player | null = null;
  @Input() hostId = '';
  @Input() myPlayerId: string | null = null;
}

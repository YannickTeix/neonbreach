import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { GameStateService } from '../../../core/game-state.service';
import { OpponentCardComponent } from './opponent-card/opponent-card.component';

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [CommonModule, OpponentCardComponent],
  templateUrl: './sidebar.component.html',
})
export class SidebarComponent {
  readonly state = inject(GameStateService);
}

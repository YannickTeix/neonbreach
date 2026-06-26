import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { GameStateService } from '../../../core/game-state.service';
import { ServerCardComponent } from './server-card/server-card.component';

@Component({
  selector: 'app-my-servers',
  standalone: true,
  imports: [CommonModule, ServerCardComponent],
  templateUrl: './my-servers.component.html',
})
export class MyServersComponent {
  readonly state = inject(GameStateService);

  trackByName(_: number, server: { name: string }): string {
    return server.name;
  }
}

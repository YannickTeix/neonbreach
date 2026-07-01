import { CommonModule } from '@angular/common';
import { Component, computed, inject } from '@angular/core';
import { GameStateService } from '../../core/game-state.service';
import { CommandBarComponent } from './command-bar/command-bar.component';
import { EventLogComponent } from './event-log/event-log.component';
import { GameOverOverlayComponent } from './game-over-overlay/game-over-overlay.component';
import { MyServersComponent } from './my-servers/my-servers.component';
import { SidebarComponent } from './sidebar/sidebar.component';

@Component({
  selector: 'app-game-screen',
  standalone: true,
  imports: [CommonModule, MyServersComponent, SidebarComponent, EventLogComponent, CommandBarComponent, GameOverOverlayComponent],
  templateUrl: './game-screen.component.html',
})
export class GameScreenComponent {
  readonly state = inject(GameStateService);

  readonly gameOver = computed(() => this.state.gameOverInfo());

  readonly statusColor = computed(() => {
    const info = this.state.gameOverInfo();
    if (!info) return '';
    if (info.draw) return 'var(--orange)';
    return info.winner?.id === this.state.myPlayerId() ? 'var(--neon)' : 'var(--red)';
  });

  stopGame(): void {
    this.state.stopGame();
  }
}

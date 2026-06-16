import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { GameStateService } from '../../core/game-state.service';

@Component({
  selector: 'app-home-screen',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './home-screen.component.html',
})
export class HomeScreenComponent {
  readonly state = inject(GameStateService);

  playerName = '';
  lobbyCode = '';

  create(): void {
    this.state.createLobby(this.playerName.trim());
  }

  join(): void {
    this.state.joinLobby(this.playerName.trim(), this.lobbyCode.trim());
  }
}

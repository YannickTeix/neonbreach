import { Component, inject } from '@angular/core';
import { GameStateService } from './core/game-state.service';
import { HomeScreenComponent } from './components/home-screen/home-screen.component';
import { LobbyScreenComponent } from './components/lobby-screen/lobby-screen.component';
import { GameScreenComponent } from './components/game-screen/game-screen.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [HomeScreenComponent, LobbyScreenComponent, GameScreenComponent],
  templateUrl: './app.component.html',
})
export class AppComponent {
  readonly state = inject(GameStateService);
}

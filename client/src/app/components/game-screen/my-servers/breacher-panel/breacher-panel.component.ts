import { CommonModule } from '@angular/common';
import { Component, computed, inject } from '@angular/core';
import { GameStateService } from '../../../../core/game-state.service';

@Component({
  selector: 'app-breacher-panel',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './breacher-panel.component.html',
})
export class BreaacherPanelComponent {
  readonly state = inject(GameStateService);

  readonly activeBreachers = computed(() =>
    this.state.myBreachers().filter((b) => b.state === 'ready' || b.state === 'connected')
  );
}

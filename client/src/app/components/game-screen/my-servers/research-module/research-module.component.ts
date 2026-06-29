import { CommonModule } from '@angular/common';
import { Component, computed, inject } from '@angular/core';
import { GameStateService } from '../../../../core/game-state.service';

@Component({
  selector: 'app-research-module',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './research-module.component.html',
})
export class ResearchModuleComponent {
  readonly state = inject(GameStateService);

  readonly module = computed(() => {
    const m = this.state.myResearchModule();
    return m?.state === 'active' ? m : null;
  });

  readonly gaugePercent = computed(() => {
    const m = this.module();
    if (!m || m.neofragsToNextLevel === null) return 100;
    return Math.min(100, (m.neofrags / m.neofragsToNextLevel) * 100);
  });
}

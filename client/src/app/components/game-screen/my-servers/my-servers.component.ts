import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { GameStateService } from '../../../core/game-state.service';
import { BreaacherPanelComponent } from './breacher-panel/breacher-panel.component';
import { ResearchModuleComponent } from './research-module/research-module.component';
import { ServerCardComponent } from './server-card/server-card.component';

@Component({
  selector: 'app-my-servers',
  standalone: true,
  imports: [CommonModule, ServerCardComponent, BreaacherPanelComponent, ResearchModuleComponent],
  templateUrl: './my-servers.component.html',
})
export class MyServersComponent {
  readonly state = inject(GameStateService);

  trackByName(_: number, server: { name: string }): string {
    return server.name;
  }
}

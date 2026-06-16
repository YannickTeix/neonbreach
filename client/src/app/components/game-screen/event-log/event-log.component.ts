import { CommonModule } from '@angular/common';
import { Component, ElementRef, inject, AfterViewChecked, ViewChild } from '@angular/core';
import { GameStateService } from '../../../core/game-state.service';

@Component({
  selector: 'app-event-log',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './event-log.component.html',
})
export class EventLogComponent implements AfterViewChecked {
  readonly state = inject(GameStateService);

  @ViewChild('log') logRef!: ElementRef<HTMLDivElement>;

  ngAfterViewChecked(): void {
    const el = this.logRef?.nativeElement;
    if (el) el.scrollTop = el.scrollHeight;
  }
}

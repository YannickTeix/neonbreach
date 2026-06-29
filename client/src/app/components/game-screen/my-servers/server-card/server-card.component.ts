import { CommonModule } from '@angular/common';
import { Component, Input, OnChanges, OnDestroy, SimpleChanges, computed, effect, inject, signal } from '@angular/core';
import { GameStateService } from '../../../../core/game-state.service';
import { integrityClass, integrityColor } from '../../../../core/health.util';
import { Breacher, ResearchModule, ServerInfo } from '../../../../core/models';

@Component({
  selector: 'app-server-card',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './server-card.component.html',
})
export class ServerCardComponent implements OnChanges, OnDestroy {
  @Input({ required: true }) server!: ServerInfo;

  private readonly state = inject(GameStateService);

  readonly animClass = signal<'attacking' | 'defending' | 'blurchanging' | null>(null);
  readonly popupText = signal<string | null>(null);
  readonly isBlurred = computed(() => this.state.blurredServers().has(this.server.name));
  readonly breacherOnServer = computed<Breacher | null>(() =>
    this.state.myBreachers().find((b) => b.sourceServer === this.server.name) ?? null
  );
  readonly researchOnServer = computed<ResearchModule | null>(() => {
    const m = this.state.myResearchModule();
    return (m && m.sourceServer === this.server.name) ? m : null;
  });

  private prevBlurred = false;
  private popupTimeout?: ReturnType<typeof setTimeout>;
  private animTimeout?: ReturnType<typeof setTimeout>;

  private readonly blurEffect = effect(() => {
    const blurred = this.isBlurred();
    if (blurred && !this.prevBlurred) {
      this.triggerBlurAnim();
    }
    this.prevBlurred = blurred;
  }, { allowSignalWrites: true });

  ngOnChanges(changes: SimpleChanges): void {
    const c = changes['server'];
    if (!c || c.firstChange) return;
    const prev: ServerInfo = c.previousValue;
    const curr: ServerInfo = c.currentValue;
    if (!prev || !curr || prev.currentIntegrity === curr.currentIntegrity) return;
    if (curr.currentIntegrity < prev.currentIntegrity && prev.currentIntegrity > 0) {
      this.triggerCombatAnim('attack', `-${prev.currentIntegrity - curr.currentIntegrity}%`);
    } else if (curr.currentIntegrity > prev.currentIntegrity) {
      this.triggerCombatAnim('defend', `+${curr.currentIntegrity - prev.currentIntegrity}%`);
    }
  }

  isDead(): boolean {
    return this.server.currentIntegrity <= 0;
  }

  integrityClass(): string {
    return this.isDead() ? 'dead' : integrityClass(this.server.currentIntegrity);
  }

  integrityColor(): string {
    return integrityColor(this.server.currentIntegrity);
  }

  ngOnDestroy(): void {
    if (this.popupTimeout) clearTimeout(this.popupTimeout);
    if (this.animTimeout) clearTimeout(this.animTimeout);
  }

  private triggerCombatAnim(type: 'attack' | 'defend', popup: string): void {
    this.animClass.set(type === 'attack' ? 'attacking' : 'defending');
    this.popupText.set(popup);
    if (this.popupTimeout) clearTimeout(this.popupTimeout);
    this.popupTimeout = setTimeout(() => {
      this.animClass.set(null);
      this.popupText.set(null);
    }, type === 'attack' ? 700 : 800);
  }

  private triggerBlurAnim(): void {
    this.animClass.set('blurchanging');
    if (this.animTimeout) clearTimeout(this.animTimeout);
    this.animTimeout = setTimeout(() => {
      if (this.animClass() === 'blurchanging') this.animClass.set(null);
    }, 700);
  }
}

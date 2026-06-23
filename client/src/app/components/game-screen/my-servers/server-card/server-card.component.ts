import { CommonModule } from '@angular/common';
import { Component, Input, OnDestroy, OnInit, computed, effect, inject, signal } from '@angular/core';
import { GameStateService } from '../../../../core/game-state.service';
import { healthClass, healthColor } from '../../../../core/health.util';
import { ServerInfo } from '../../../../core/models';

@Component({
  selector: 'app-server-card',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './server-card.component.html',
})
export class ServerCardComponent implements OnInit, OnDestroy {
  @Input({ required: true }) server!: ServerInfo;

  private readonly state = inject(GameStateService);

  readonly animClass = signal<'attacking' | 'defending' | 'blurchanging' | null>(null);
  readonly popupText = signal<string | null>(null);
  readonly isBlurred = computed(() => this.state.blurredServers().has(this.server.name));

  private lastSeq = 0;
  private prevBlurred = false;
  private popupTimeout?: ReturnType<typeof setTimeout>;
  private animTimeout?: ReturnType<typeof setTimeout>;

  private readonly combatEffect = effect(() => {
    const payload = this.state.lastGameEvent();
    if (!payload || payload.seq === this.lastSeq) return;
    const { event } = payload;
    if (event.targetServerName !== this.server.name) return;
    this.lastSeq = payload.seq;
    this.triggerCombatAnim(event.type, event.type === 'attack' ? '-20%' : '+15%');
  });

  private readonly blurEffect = effect(() => {
    const blurred = this.isBlurred();
    if (blurred && !this.prevBlurred) {
      this.triggerBlurAnim();
    }
    this.prevBlurred = blurred;
  });

  isDead(): boolean {
    return this.server.health <= 0;
  }

  healthClass(): string {
    return this.isDead() ? 'dead' : healthClass(this.server.health);
  }

  healthColor(): string {
    return healthColor(this.server.health);
  }

  ngOnInit(): void {}

  ngOnDestroy(): void {
    if (this.popupTimeout) clearTimeout(this.popupTimeout);
    if (this.animTimeout) clearTimeout(this.animTimeout);
  }

  private triggerCombatAnim(type: 'attack' | 'defend', popup: string): void {
    if (this.isDead()) return;
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

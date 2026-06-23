import { CommonModule } from '@angular/common';
import { Component, ElementRef, OnDestroy, ViewChild, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { GameStateService } from '../../../core/game-state.service';

interface Suggestion {
  name: string;
  hp: number;
  type: 'attack' | 'defend';
  owner: string;
}

interface CooldownView {
  active: boolean;
  pct: number;
  label: string;
}

@Component({
  selector: 'app-command-bar',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './command-bar.component.html',
})
export class CommandBarComponent implements OnDestroy {
  readonly state = inject(GameStateService);

  @ViewChild('input') inputRef!: ElementRef<HTMLInputElement>;

  commandText = '';
  readonly showHelp = signal(false);
  readonly suggestions = signal<Suggestion[]>([]);
  readonly activeSuggestionIdx = signal(-1);

  readonly cooldownAttack = signal<CooldownView>({ active: false, pct: 0, label: 'PRÊT' });
  readonly cooldownDefend = signal<CooldownView>({ active: false, pct: 0, label: 'PRÊT' });

  private cmdHistory: string[] = [];
  private cmdHistIdx = -1;

  private attackEnd = 0;
  private attackDuration = 3000;
  private defendEnd = 0;
  private defendDuration = 5000;
  private rafId: number | null = null;

  private readonly cooldownEffect = effect(() => {
    const payload = this.state.cooldownStart();
    if (!payload) return;
    const now = Date.now();
    if (payload.type === 'attack') {
      this.attackEnd = now + payload.duration;
      this.attackDuration = payload.duration;
    } else {
      this.defendEnd = now + payload.duration;
      this.defendDuration = payload.duration;
    }
    this.startTicking();
  });

  private startTicking(): void {
    if (this.rafId !== null) return;
    const tick = () => {
      const now = Date.now();
      let anyActive = false;

      if (now < this.attackEnd) {
        anyActive = true;
        const remaining = this.attackEnd - now;
        this.cooldownAttack.set({ active: true, pct: (remaining / this.attackDuration) * 100, label: `${(remaining / 1000).toFixed(1)}s` });
      } else {
        this.cooldownAttack.set({ active: false, pct: 0, label: 'PRÊT' });
      }

      if (now < this.defendEnd) {
        anyActive = true;
        const remaining = this.defendEnd - now;
        this.cooldownDefend.set({ active: true, pct: (remaining / this.defendDuration) * 100, label: `${(remaining / 1000).toFixed(1)}s` });
      } else {
        this.cooldownDefend.set({ active: false, pct: 0, label: 'PRÊT' });
      }

      if (anyActive) this.rafId = requestAnimationFrame(tick);
      else this.rafId = null;
    };
    this.rafId = requestAnimationFrame(tick);
  }

  ngOnDestroy(): void {
    if (this.rafId !== null) cancelAnimationFrame(this.rafId);
  }

  onInput(): void {
    this.updateSuggestions();
  }

  private updateSuggestions(): void {
    const val = this.commandText.trim().toLowerCase();
    this.activeSuggestionIdx.set(-1);
    if (!val) {
      this.suggestions.set([]);
      return;
    }

    const parts = val.split(/\s+/);
    const cmd = parts[0];
    const query = parts.slice(1).join('').toUpperCase();
    const pool: Suggestion[] = [];

    if (cmd === 'attack' || cmd === 'a') {
      for (const p of this.state.opponents()) {
        for (const s of p.servers) {
          if (s.health > 0 && s.name.startsWith(query)) {
            pool.push({ name: s.name, hp: s.health, type: 'attack', owner: p.name });
          }
        }
      }
    } else if (cmd === 'defend' || cmd === 'd') {
      const me = this.state.myPlayer();
      if (me) {
        for (const s of me.servers) {
          if (s.health > 0 && s.name.startsWith(query)) {
            pool.push({ name: s.name, hp: s.health, type: 'defend', owner: 'Vous' });
          }
        }
      }
    }

    this.suggestions.set(parts.length < 2 ? [] : pool);
  }

  pickSuggestion(s: Suggestion): void {
    const cmd = this.commandText.trim().split(/\s+/)[0];
    this.commandText = `${cmd} ${s.name}`;
    this.suggestions.set([]);
    this.inputRef.nativeElement.focus();
  }

  onKeydown(e: KeyboardEvent): void {
    const list = this.suggestions();
    const idx = this.activeSuggestionIdx();

    if (e.key === 'Enter') {
      e.preventDefault();
      if (idx >= 0 && list[idx]) {
        this.pickSuggestion(list[idx]);
      } else {
        this.send();
      }
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (list.length) {
        this.activeSuggestionIdx.set(Math.min(idx + 1, list.length - 1));
      } else if (this.cmdHistory.length) {
        this.cmdHistIdx = Math.min(this.cmdHistIdx + 1, this.cmdHistory.length - 1);
        this.commandText = this.cmdHistory[this.cmdHistIdx];
      }
      return;
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (list.length && idx > 0) {
        this.activeSuggestionIdx.set(idx - 1);
      } else if (this.cmdHistIdx > 0) {
        this.cmdHistIdx--;
        this.commandText = this.cmdHistory[this.cmdHistIdx];
      }
      return;
    }

    if (e.key === 'Escape') {
      this.suggestions.set([]);
    }
  }

  toggleHelp(): void {
    this.showHelp.update((v) => !v);
  }

  send(): void {
    const cmd = this.commandText.trim();
    if (!cmd) return;

    this.cmdHistory.unshift(cmd);
    if (this.cmdHistory.length > 30) this.cmdHistory.pop();
    this.cmdHistIdx = -1;

    this.state.sendCommand(cmd);
    this.suggestions.set([]);
    this.commandText = '';
  }
}

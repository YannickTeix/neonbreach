import { CommonModule } from '@angular/common';
import { Component, ElementRef, OnDestroy, ViewChild, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { GameStateService } from '../../../core/game-state.service';

interface Suggestion {
  name: string;
  label: string;
  type: 'attack' | 'defend' | 'blurchange';
}

interface CooldownView {
  active: boolean;
  pct: number;
  label: string;
}

const READY: CooldownView = { active: false, pct: 0, label: 'PRÊT' };

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

  readonly cooldownAttack    = signal<CooldownView>(READY);
  readonly cooldownDefend    = signal<CooldownView>(READY);
  readonly cooldownBlurchange = signal<CooldownView>(READY);

  private cmdHistory: string[] = [];
  private cmdHistIdx = -1;

  private attackEnd = 0;       private attackDuration = 3000;
  private defendEnd = 0;       private defendDuration = 5000;
  private blurchangeEnd = 0;   private blurchangeDuration = 15000;
  private rafId: number | null = null;

  private readonly cooldownEffect = effect(() => {
    const payload = this.state.cooldownStart();
    if (!payload) return;
    const now = Date.now();
    if (payload.type === 'attack') {
      this.attackEnd = now + payload.duration;
      this.attackDuration = payload.duration;
    } else if (payload.type === 'defend') {
      this.defendEnd = now + payload.duration;
      this.defendDuration = payload.duration;
    } else if (payload.type === 'blurchange') {
      this.blurchangeEnd = now + payload.duration;
      this.blurchangeDuration = payload.duration;
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
        const rem = this.attackEnd - now;
        this.cooldownAttack.set({ active: true, pct: (rem / this.attackDuration) * 100, label: `${(rem / 1000).toFixed(1)}s` });
      } else {
        this.cooldownAttack.set(READY);
      }

      if (now < this.defendEnd) {
        anyActive = true;
        const rem = this.defendEnd - now;
        this.cooldownDefend.set({ active: true, pct: (rem / this.defendDuration) * 100, label: `${(rem / 1000).toFixed(1)}s` });
      } else {
        this.cooldownDefend.set(READY);
      }

      if (now < this.blurchangeEnd) {
        anyActive = true;
        const rem = this.blurchangeEnd - now;
        this.cooldownBlurchange.set({ active: true, pct: (rem / this.blurchangeDuration) * 100, label: `${(rem / 1000).toFixed(1)}s` });
      } else {
        this.cooldownBlurchange.set(READY);
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
    if (!val) { this.suggestions.set([]); return; }

    const parts = val.split(/\s+/);
    const cmd   = parts[0];
    const query = parts.slice(1).join('').toUpperCase();
    const pool: Suggestion[] = [];
    const blurred = this.state.blurredServers();

    if (cmd === 'attack' || cmd === 'a') {
      for (const p of this.state.opponents()) {
        for (const s of p.servers) {
          if (s.health > 0 && !blurred.has(s.name) && s.name.startsWith(query)) {
            pool.push({ name: s.name, label: `${s.health}% · ${p.name}`, type: 'attack' });
          }
        }
      }
    } else if (cmd === 'defend' || cmd === 'd') {
      const me = this.state.myPlayer();
      if (me) {
        for (const s of me.servers) {
          if (s.health > 0 && s.name.startsWith(query)) {
            pool.push({ name: s.name, label: `${s.health}%`, type: 'defend' });
          }
        }
      }
    } else if (cmd === 'blurchange' || cmd === 'b') {
      const lobby = this.state.lobby();
      if (lobby) {
        for (const p of lobby.players) {
          const liveCount = p.servers.filter((s) => s.health > 0).length;
          const isSelf = p.id === this.state.myPlayerId();
          if (liveCount > 0 && p.name.toUpperCase().startsWith(query)) {
            pool.push({ name: p.name, label: `${liveCount} serveur(s)${isSelf ? ' · vous' : ''}`, type: 'blurchange' });
          }
        }
      }
    } else if (cmd === 'breach') {
      const subCmd = parts[1]?.toLowerCase();
      if (subCmd === 'prepare') {
        const q = (parts[2] ?? '').toUpperCase();
        const me = this.state.myPlayer();
        if (me) {
          for (const s of me.servers) {
            if (s.health > 0 && s.name.startsWith(q)) {
              pool.push({ name: s.name, label: `${s.health}%`, type: 'attack' });
            }
          }
        }
      } else if (subCmd === 'connect') {
        if (parts.length <= 3) {
          const q = (parts[2] ?? '').toUpperCase();
          for (const b of this.state.myBreachers()) {
            if (b.state === 'ready' && b.name && b.name.startsWith(q)) {
              pool.push({ name: b.name, label: `sur ${b.sourceServer}`, type: 'blurchange' });
            }
          }
        } else {
          const q = (parts[3] ?? '').toUpperCase();
          for (const p of this.state.opponents()) {
            if (p.name.toUpperCase().startsWith(q)) {
              pool.push({ name: p.name, label: 'adversaire', type: 'blurchange' });
            }
          }
        }
      }
    }

    this.suggestions.set(parts.length < 2 ? [] : pool);
  }

  pickSuggestion(s: Suggestion): void {
    const parts = this.commandText.trim().split(/\s+/);
    const cmd = parts[0]?.toLowerCase();
    if (cmd === 'breach') {
      const subCmd = parts[1]?.toLowerCase();
      if (subCmd === 'prepare') {
        this.commandText = `breach prepare ${s.name}`;
      } else if (subCmd === 'connect') {
        if (parts.length <= 3) {
          this.commandText = `breach connect ${s.name} `;
          this.updateSuggestions();
          this.inputRef.nativeElement.focus();
          return;
        } else {
          this.commandText = `breach connect ${parts[2]} ${s.name}`;
        }
      }
    } else {
      this.commandText = `${cmd} ${s.name}`;
    }
    this.suggestions.set([]);
    this.inputRef.nativeElement.focus();
  }

  onKeydown(e: KeyboardEvent): void {
    const list = this.suggestions();
    const idx  = this.activeSuggestionIdx();

    if (e.key === 'Enter') {
      e.preventDefault();
      if (idx >= 0 && list[idx]) { this.pickSuggestion(list[idx]); } else { this.send(); }
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (list.length) { this.activeSuggestionIdx.set(Math.min(idx + 1, list.length - 1)); }
      else if (this.cmdHistory.length) { this.cmdHistIdx = Math.min(this.cmdHistIdx + 1, this.cmdHistory.length - 1); this.commandText = this.cmdHistory[this.cmdHistIdx]; }
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (list.length && idx > 0) { this.activeSuggestionIdx.set(idx - 1); }
      else if (this.cmdHistIdx > 0) { this.cmdHistIdx--; this.commandText = this.cmdHistory[this.cmdHistIdx]; }
      return;
    }
    if (e.key === 'Escape') { this.suggestions.set([]); }
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

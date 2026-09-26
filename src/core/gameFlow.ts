import type { MenuAction } from '../input/types';

export type Screen =
  | 'title'
  | 'characterSelect'
  | 'stageSelect'
  | 'countdown'
  | 'racing'
  | 'paused'
  | 'continue'
  | 'gameOver'
  | 'finished';

export const COUNTDOWN_SECONDS = 3;
export const CONTINUE_SECONDS = 9;
/** Results ignore input for a moment so a late button press doesn't skip them. */
export const RESULT_LOCK_SECONDS = 1;

export type FlowEffect =
  | { readonly type: 'startRace' }
  | { readonly type: 'continueRace' }
  | { readonly type: 'quitRace' }
  | { readonly type: 'restartRace' }
  /** Tried to confirm a rider or stage that isn't unlocked yet. */
  | { readonly type: 'locked' }
  /** Change the paint of the highlighted rider. */
  | { readonly type: 'cyclePaint'; readonly dir: 1 | -1 };

export interface FlowOptions {
  readonly characterCount: number;
  readonly stageCount: number;
  readonly isLocked?: (kind: 'character' | 'stage', index: number) => boolean;
}

/**
 * UI-agnostic arcade flow:
 * title → character → stage → countdown → racing ⇄ paused
 * racing → continue (time up) → countdown | gameOver ; racing → finished
 * gameOver | finished → countdown (play again) | title ; 'restart' restarts instantly from any race screen
 */
export class GameFlow {
  screen: Screen = 'title';
  characterIndex = 0;
  stageIndex = 0;
  pauseIndex = 0;
  countdown = 0;
  continueTimer = 0;
  resultLock = 0;
  private readonly listeners = new Set<(s: Screen) => void>();

  constructor(private readonly opts: FlowOptions) {}

  onChange(fn: (s: Screen) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private go(s: Screen): void {
    this.screen = s;
    for (const l of this.listeners) l(s);
  }

  static readonly PAUSE_ITEMS = ['resume', 'restart', 'quit'] as const;

  private locked(kind: 'character' | 'stage', i: number): boolean {
    return this.opts.isLocked?.(kind, i) ?? false;
  }

  private restart(): FlowEffect {
    this.startCountdown();
    return { type: 'restartRace' };
  }

  handle(action: MenuAction): FlowEffect | null {
    const wrap = (i: number, n: number): number => ((i % n) + n) % n;
    if (action === 'restart') {
      const inRace: readonly Screen[] = ['countdown', 'racing', 'paused', 'continue', 'gameOver', 'finished'];
      return inRace.includes(this.screen) ? this.restart() : null;
    }
    switch (this.screen) {
      case 'title':
        if (action === 'confirm') this.go('characterSelect');
        return null;
      case 'characterSelect':
        if (action === 'left') this.characterIndex = wrap(this.characterIndex - 1, this.opts.characterCount);
        else if (action === 'right') this.characterIndex = wrap(this.characterIndex + 1, this.opts.characterCount);
        else if (action === 'up' || action === 'down') {
          if (this.locked('character', this.characterIndex)) return null;
          return { type: 'cyclePaint', dir: action === 'up' ? -1 : 1 };
        } else if (action === 'confirm') {
          if (this.locked('character', this.characterIndex)) return { type: 'locked' };
          this.go('stageSelect');
        } else if (action === 'back' || action === 'pause') this.go('title');
        this.go(this.screen);
        return null;
      case 'stageSelect':
        if (action === 'left' || action === 'up') this.stageIndex = wrap(this.stageIndex - 1, this.opts.stageCount);
        else if (action === 'right' || action === 'down')
          this.stageIndex = wrap(this.stageIndex + 1, this.opts.stageCount);
        else if (action === 'back' || action === 'pause') this.go('characterSelect');
        else if (action === 'confirm') {
          if (this.locked('stage', this.stageIndex)) return { type: 'locked' };
          this.startCountdown();
          return { type: 'startRace' };
        }
        this.go(this.screen);
        return null;
      case 'racing':
      case 'countdown':
        if (action === 'pause' || action === 'back') {
          this.pauseIndex = 0;
          this.resumeTo = this.screen;
          this.go('paused');
        }
        return null;
      case 'paused': {
        const n = GameFlow.PAUSE_ITEMS.length;
        if (action === 'up') this.pauseIndex = wrap(this.pauseIndex - 1, n);
        else if (action === 'down') this.pauseIndex = wrap(this.pauseIndex + 1, n);
        else if (action === 'pause' || action === 'back') {
          this.go(this.resumeTo);
          return null;
        } else if (action === 'confirm') return this.selectPause(GameFlow.PAUSE_ITEMS[this.pauseIndex]!);
        this.go(this.screen);
        return null;
      }
      case 'continue':
        if (action === 'confirm') {
          this.startCountdown();
          return { type: 'continueRace' };
        }
        if (action === 'back') this.showResult('gameOver');
        return null;
      case 'gameOver':
      case 'finished':
        if (this.resultLock > 0) return null;
        if (action === 'confirm') return this.restart();
        if (action === 'back' || action === 'pause') {
          this.go('title');
          return { type: 'quitRace' };
        }
        return null;
    }
  }

  private resumeTo: Screen = 'racing';

  selectPause(item: (typeof GameFlow.PAUSE_ITEMS)[number]): FlowEffect | null {
    if (this.screen !== 'paused') return null;
    if (item === 'resume') {
      this.go(this.resumeTo);
      return null;
    }
    if (item === 'restart') return this.restart();
    this.go('title');
    return { type: 'quitRace' };
  }

  /** Pointer selection: first tap highlights, tapping the highlighted card confirms. */
  pickCharacter(i: number): FlowEffect | null {
    if (this.screen !== 'characterSelect' || i < 0 || i >= this.opts.characterCount) return null;
    if (i === this.characterIndex) return this.handle('confirm');
    this.characterIndex = i;
    this.go(this.screen);
    return null;
  }

  pickStage(i: number): FlowEffect | null {
    if (this.screen !== 'stageSelect' || i < 0 || i >= this.opts.stageCount) return null;
    if (i === this.stageIndex) return this.handle('confirm');
    this.stageIndex = i;
    this.go(this.screen);
    return null;
  }

  private startCountdown(): void {
    this.countdown = COUNTDOWN_SECONDS;
    this.go('countdown');
  }

  /** Results screen button: play again or back to the title. */
  selectResult(item: 'again' | 'menu'): FlowEffect | null {
    if (this.screen !== 'gameOver' && this.screen !== 'finished') return null;
    if (item === 'again') return this.restart();
    this.go('title');
    return { type: 'quitRace' };
  }

  /** Time-driven transitions. */
  update(dt: number): FlowEffect | null {
    this.resultLock = Math.max(0, this.resultLock - dt);
    if (this.screen === 'countdown') {
      this.countdown -= dt;
      if (this.countdown <= 0) {
        this.countdown = 0;
        this.go('racing');
      }
    } else if (this.screen === 'continue') {
      const before = Math.ceil(this.continueTimer);
      this.continueTimer -= dt;
      if (this.continueTimer <= 0) {
        this.continueTimer = 0;
        this.showResult('gameOver');
      } else if (Math.ceil(this.continueTimer) !== before) this.go('continue');
    }
    return null;
  }

  notifyTimeUp(): void {
    if (this.screen !== 'racing') return;
    this.continueTimer = CONTINUE_SECONDS;
    this.go('continue');
  }

  notifyFinished(): void {
    if (this.screen !== 'racing') return;
    this.showResult('finished');
  }

  private showResult(s: 'gameOver' | 'finished'): void {
    this.resultLock = RESULT_LOCK_SECONDS;
    this.go(s);
  }

  get simulationRunning(): boolean {
    return this.screen === 'racing' || this.screen === 'countdown';
  }
}

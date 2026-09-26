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

export type FlowEffect =
  | { readonly type: 'startRace' }
  | { readonly type: 'continueRace' }
  | { readonly type: 'quitRace' }
  | { readonly type: 'restartRace' };

export interface FlowOptions {
  readonly characterCount: number;
  readonly stageCount: number;
}

/**
 * UI-agnostic arcade flow:
 * title → character → stage → countdown → racing ⇄ paused
 * racing → continue (time up) → countdown | gameOver ; racing → finished
 */
export class GameFlow {
  screen: Screen = 'title';
  characterIndex = 0;
  stageIndex = 0;
  pauseIndex = 0;
  countdown = 0;
  continueTimer = 0;
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

  handle(action: MenuAction): FlowEffect | null {
    const wrap = (i: number, n: number): number => ((i % n) + n) % n;
    switch (this.screen) {
      case 'title':
        if (action === 'confirm') this.go('characterSelect');
        return null;
      case 'characterSelect':
        if (action === 'left' || action === 'up')
          this.characterIndex = wrap(this.characterIndex - 1, this.opts.characterCount);
        else if (action === 'right' || action === 'down')
          this.characterIndex = wrap(this.characterIndex + 1, this.opts.characterCount);
        else if (action === 'confirm') this.go('stageSelect');
        else if (action === 'back' || action === 'pause') this.go('title');
        this.go(this.screen);
        return null;
      case 'stageSelect':
        if (action === 'left' || action === 'up') this.stageIndex = wrap(this.stageIndex - 1, this.opts.stageCount);
        else if (action === 'right' || action === 'down')
          this.stageIndex = wrap(this.stageIndex + 1, this.opts.stageCount);
        else if (action === 'back' || action === 'pause') this.go('characterSelect');
        else if (action === 'confirm') {
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
        if (action === 'back') {
          this.go('gameOver');
        }
        return null;
      case 'gameOver':
      case 'finished':
        if (action === 'confirm' || action === 'back') {
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
    if (item === 'restart') {
      this.startCountdown();
      return { type: 'restartRace' };
    }
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

  /** Time-driven transitions. */
  update(dt: number): FlowEffect | null {
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
        this.go('gameOver');
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
    this.go('finished');
  }

  get simulationRunning(): boolean {
    return this.screen === 'racing' || this.screen === 'countdown';
  }
}

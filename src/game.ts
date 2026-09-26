import { AudioEngine } from './audio/audio';
import { challengeMask, countBits, gradeFor } from './content/challenges';
import { CHARACTERS, type CharacterDef } from './content/characters';
import { levelFor, PAINTS, paintUnlocked } from './content/progression';
import { STAGES } from './content/stages';
import { GameFlow, type FlowEffect, type Screen } from './core/gameFlow';
import { FIXED_DT, FixedStepper } from './core/loop';
import { SaveData } from './core/storage';
import { fetchDeployedVersion, UpdateChecker } from './core/updateCheck';
import { GamepadInput } from './input/gamepad';
import { KeyboardInput } from './input/keyboard';
import { isTouchDevice, TouchInput } from './input/touch';
import { combineControls, neutralControls, type MenuAction } from './input/types';
import { GameRenderer } from './render/renderer';
import { comboMultiplier } from './sim/combo';
import type { SimEvent } from './sim/events';
import { ghostPose, type GhostData } from './sim/ghost';
import { routeToMainS } from './sim/shortcuts';
import { Track } from './sim/track';
import { EXPLODE_POINTS, RIVAL_POINTS, World } from './sim/world';
import { Hud } from './ui/hud';
import { detectLocale, I18n, type MessageKey } from './ui/i18n';
import { renderScreen, type ResultInfo } from './ui/screens';

const RACE_SCREENS: readonly Screen[] = ['countdown', 'racing', 'paused', 'continue'];
const STAGE_LENGTHS = STAGES.map((s) => new Track(s.controlPoints, 1, s.profile).length);
/** Brief slow motion (time scale, real seconds) on near misses and jumps. */
const SLOWMO_NEAR_MISS = { scale: 0.45, time: 0.22 } as const;
const SLOWMO_JUMP = { scale: 0.6, time: 0.3 } as const;

/** Composition root: wires flow, simulation, rendering, input, audio and UI. */
export class Game {
  private readonly save = new SaveData(safeLocalStorage());
  private readonly i18n: I18n;
  private readonly flow = new GameFlow({
    characterCount: CHARACTERS.length,
    stageCount: STAGES.length,
    isLocked: (kind, i) => this.isLocked(kind, i),
  });
  private readonly renderer: GameRenderer;
  private readonly audio = new AudioEngine();
  private readonly keyboard: KeyboardInput;
  private readonly gamepad: GamepadInput;
  private readonly touch: TouchInput;
  private readonly hud: Hud;
  private readonly screenRoot: HTMLElement;
  private readonly stepper = new FixedStepper();
  private readonly isTouch = isTouchDevice();
  private readonly listeners = new AbortController();
  private world: World;
  private result: ResultInfo | null = null;
  private lastFrame = 0;
  private lastCountdownShown = -1;
  private ghost: GhostData | null = null;
  private slowScale = 1;
  private slowTime = 0;
  /** Fixed traffic seed for reproducible end-to-end tests; random traffic and roadworks otherwise. */
  private readonly fixedSeed: boolean;
  private updates: UpdateChecker | null = null;
  private frameId = 0;
  private disposed = false;

  constructor(private readonly root: HTMLElement) {
    this.i18n = new I18n(this.save.settings.locale ?? detectLocale(navigator.languages ?? [navigator.language]));
    document.documentElement.lang = this.i18n.locale;
    this.audio.setEnabled(this.save.settings.sound);

    const canvas = root.querySelector<HTMLCanvasElement>('#game-canvas')!;
    this.screenRoot = root.querySelector<HTMLElement>('#screens')!;
    const overlay = root.querySelector<HTMLElement>('#overlay')!;

    const params = new URLSearchParams(location.search);
    this.fixedSeed = params.has('e2e');
    this.renderer = new GameRenderer(canvas, params.get('quality') === 'low' ? 'low' : 'high');
    this.world = this.previewWorld();
    this.renderer.setWorld(this.world);

    this.hud = new Hud(overlay, this.i18n, () => this.onMenu('pause'));
    this.touch = new TouchInput(overlay, this.touchLabels());
    root.classList.toggle('is-touch', this.isTouch);

    this.keyboard = new KeyboardInput(window, (a) => this.onMenu(a));
    this.gamepad = new GamepadInput((a) => this.onMenu(a));

    window.addEventListener('resize', () => this.renderer.resize(), { signal: this.listeners.signal });
    window.addEventListener('pointerdown', () => this.audio.unlock(), {
      passive: true,
      signal: this.listeners.signal,
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.flow.screen === 'racing') this.onMenu('pause');
      if (!document.hidden) void this.updates?.check();
    }, { signal: this.listeners.signal });

    if (!import.meta.env.DEV && !params.has('e2e')) {
      this.updates = new UpdateChecker({
        current: __APP_VERSION__,
        fetchVersion: () => fetchDeployedVersion(document.baseURI),
        getScreen: () => this.flow.screen,
        reload: () => location.reload(),
        storage: safeSessionStorage(),
      });
      window.addEventListener('pageshow', (e) => {
        if (e.persisted) void this.updates?.check();
      }, { signal: this.listeners.signal });
      void this.updates.check();
    }

    this.flow.onChange((s) => this.onScreen(s));
    this.onScreen(this.flow.screen);

    if (params.has('e2e')) {
      (window as unknown as Record<string, unknown>).__RR__ = { flow: this.flow, game: this };
    }
  }

  get currentWorld(): World {
    return this.world;
  }

  start(): void {
    if (this.disposed) return;
    const frame = (t: number): void => {
      if (this.disposed) return;
      const dt = this.lastFrame ? Math.min((t - this.lastFrame) / 1000, 0.1) : 0;
      this.lastFrame = t;
      this.tick(dt);
      this.frameId = requestAnimationFrame(frame);
    };
    this.frameId = requestAnimationFrame(frame);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (this.frameId) cancelAnimationFrame(this.frameId);
    this.listeners.abort();
    this.keyboard.dispose();
    this.gamepad.dispose();
    this.touch.dispose();
    this.audio.stopEngine();
    this.audio.stopMusic();
  }

  private previewWorld(): World {
    return new World(STAGES[this.flow.stageIndex]!, this.paintedCharacter(this.flow.characterIndex));
  }

  private totalStars(): number {
    return STAGES.reduce((n, s) => n + countBits(this.save.stars(s.id)), 0);
  }

  private isLocked(kind: 'character' | 'stage', i: number, stars = this.totalStars()): boolean {
    const need = kind === 'character' ? CHARACTERS[i]?.unlockStars : STAGES[i]?.unlockStars;
    return (need ?? 0) > stars;
  }

  /** Rider with the selected (unlocked) paint applied. */
  private paintedCharacter(i: number): CharacterDef {
    const c = CHARACTERS[i]!;
    const idx = this.save.paint(c.id);
    const paint = PAINTS[idx];
    if (!paint?.color || !paintUnlocked(idx, levelFor(this.save.profile.xp))) return c;
    return { ...c, colors: { ...c.colors, body: paint.color } };
  }

  private cyclePaint(dir: 1 | -1): void {
    const c = CHARACTERS[this.flow.characterIndex]!;
    if (this.flow.screen !== 'characterSelect' || this.isLocked('character', this.flow.characterIndex)) return;
    const level = levelFor(this.save.profile.xp);
    let i = this.save.paint(c.id);
    for (let k = 0; k < PAINTS.length; k++) {
      i = (i + dir + PAINTS.length) % PAINTS.length;
      if (paintUnlocked(i, level)) break;
    }
    this.save.setPaint(c.id, i);
    this.world = this.previewWorld();
    this.renderer.setWorld(this.world);
    this.onScreen(this.flow.screen);
  }

  private touchLabels(): { gas: string; brake: string; wheelie: string } {
    return { gas: this.i18n.t('touch.gas'), brake: this.i18n.t('touch.brake'), wheelie: this.i18n.t('touch.wheelie') };
  }

  private onMenu(a: MenuAction): void {
    this.audio.unlock();
    const s = this.flow.screen;
    if (s !== 'racing' && s !== 'countdown') this.audio.uiBlip();
    this.applyEffect(this.flow.handle(a));
  }

  private applyEffect(effect: FlowEffect | null): void {
    if (!effect) return;
    switch (effect.type) {
      case 'startRace':
      case 'restartRace': {
        const stage = STAGES[this.flow.stageIndex]!;
        const seed = this.fixedSeed ? stage.seed : (Math.random() * 0x7fffffff) >>> 0;
        this.world = new World(stage, this.paintedCharacter(this.flow.characterIndex), seed);
        this.renderer.setWorld(this.world);
        this.hud.setWorld(this.world);
        this.hud.setBest(this.save.best(stage.id)?.score ?? null);
        this.ghost = this.save.ghost(stage.id, this.world.character.id);
        this.renderer.setGhost(this.ghost);
        this.result = null;
        this.slowTime = 0;
        this.stepper.reset();
        this.audio.startEngine();
        this.audio.startMusic();
        break;
      }
      case 'continueRace':
        this.world.continueFromCheckpoint();
        this.audio.startEngine();
        this.audio.startMusic();
        break;
      case 'quitRace':
        this.audio.stopEngine();
        this.audio.stopMusic();
        this.world = this.previewWorld();
        this.renderer.setWorld(this.world);
        break;
      case 'locked':
        this.audio.denied();
        break;
      case 'cyclePaint':
        this.cyclePaint(effect.dir);
        break;
    }
  }

  private onScreen(s: Screen): void {
    this.updates?.onScreen(s);
    if (s === 'stageSelect' && this.world.stage.id !== STAGES[this.flow.stageIndex]!.id) {
      // Preview the highlighted stage behind the cards.
      this.world = this.previewWorld();
      this.renderer.setWorld(this.world);
    }
    if (s === 'characterSelect') {
      const c = this.paintedCharacter(this.flow.characterIndex);
      if (this.world.character.id !== c.id || this.world.character.colors.body !== c.colors.body) {
        this.world = new World(STAGES[this.flow.stageIndex]!, c);
        this.renderer.setWorld(this.world);
      }
    }
    if (s === 'gameOver' && !this.result) this.result = this.finishResult(false);
    if (s === 'gameOver' || s === 'title') {
      this.audio.stopEngine();
      this.audio.stopMusic();
    }

    this.renderer.mode =
      s === 'title' ? 'orbit' : RACE_SCREENS.includes(s) || s === 'finished' || s === 'gameOver' ? 'chase' : 'showcase';
    this.hud.setVisible(RACE_SCREENS.includes(s));
    this.touch.setVisible(this.isTouch && (s === 'racing' || s === 'countdown'));
    this.root.dataset.screen = s;

    const key = `${STAGES[this.flow.stageIndex]!.id}`;
    renderScreen(
      this.screenRoot,
      s,
      {
        flow: this.flow,
        i18n: this.i18n,
        soundOn: this.save.settings.sound,
        bestScore: this.save.best(key)?.score ?? null,
        result: this.result,
        stageLengths: STAGE_LENGTHS,
        isTouch: this.isTouch,
        profile: this.save.profile,
        totalStars: this.totalStars(),
        starsOf: (id) => this.save.stars(id),
        discoveredOf: (id) => this.save.discovered(id),
        bestOf: (id) => this.save.best(id)?.score ?? null,
        paintOf: (id) => this.save.paint(id),
        isLocked: (kind, i) => this.isLocked(kind, i),
      },
      {
        action: (a) => this.onMenu(a),
        selectCharacter: (i) => this.applyEffect(this.flow.pickCharacter(i)),
        selectStage: (i) => this.applyEffect(this.flow.pickStage(i)),
        pauseItem: (item) => this.applyEffect(this.flow.selectPause(item)),
        resultItem: (item) => {
          this.audio.uiBlip();
          this.applyEffect(this.flow.selectResult(item));
        },
        cyclePaint: (dir) => {
          this.audio.uiBlip();
          this.cyclePaint(dir);
        },
        toggleLocale: () => this.toggleLocale(),
        toggleSound: () => this.toggleSound(),
      },
    );
  }

  private toggleLocale(): void {
    this.i18n.locale = this.i18n.locale === 'es' ? 'en' : 'es';
    document.documentElement.lang = this.i18n.locale;
    this.save.updateSettings({ locale: this.i18n.locale });
    this.hud.refreshLabels();
    this.touch.setLabels(this.touchLabels());
    this.onScreen(this.flow.screen);
  }

  private toggleSound(): void {
    this.save.updateSettings({ sound: !this.save.settings.sound });
    this.audio.unlock();
    this.audio.setEnabled(this.save.settings.sound);
    this.onScreen(this.flow.screen);
  }

  /** Records the run (best score, stars, career, ghost) and builds the results screen data. */
  private finishResult(finished: boolean): ResultInfo {
    const w = this.world;
    const stage = w.stage;
    const score = w.score;
    const time = w.race.elapsed;
    const summary = w.summary();

    const prevBest = this.save.best(stage.id)?.score ?? null;
    const newBest = this.save.submit(stage.id, { score, time }) && (finished || score > 0);
    const toBest = !newBest && prevBest !== null && prevBest >= score ? prevBest - score : null;

    const starsBefore = this.totalStars();
    const mask = challengeMask(stage.challenges, summary);
    const fresh = this.save.addStars(stage.id, mask);
    const starsAfter = this.totalStars();
    const unlocked: string[] = [];
    CHARACTERS.forEach((c, i) => {
      if (this.isLocked('character', i, starsBefore) && !this.isLocked('character', i, starsAfter))
        unlocked.push(c.nameKey);
    });
    STAGES.forEach((st, i) => {
      if (this.isLocked('stage', i, starsBefore) && !this.isLocked('stage', i, starsAfter)) unlocked.push(st.nameKey);
    });

    const levelBefore = levelFor(this.save.profile.xp);
    this.save.addRun({
      xp: score,
      delivered: finished ? 1 : 0,
      distance: w.mainS,
      nearMisses: w.stats.nearMisses,
      explosions: w.stats.explosions,
      bestCombo: w.combo.best,
    });
    const levelAfter = levelFor(this.save.profile.xp);
    for (const p of PAINTS) if (p.level > levelBefore && p.level <= levelAfter) unlocked.push(p.nameKey);

    const vsGhost = finished && this.ghost ? time - this.ghost.time : null;
    if (finished && w.race.continues === 0) this.save.submitGhost(stage.id, w.character.id, w.recorder.finish(time));

    return {
      score,
      time,
      newBest,
      finished,
      grade: finished ? gradeFor(score, stage.grades) : null,
      challenges: stage.challenges,
      mask,
      fresh,
      xp: score,
      levelBefore,
      levelAfter,
      unlocked,
      toBest,
      vsGhost,
      bestCombo: w.combo.best,
      nearMisses: w.stats.nearMisses,
      rival: w.rival ? { nameKey: w.rival.character.nameKey, won: w.beatRival, points: RIVAL_POINTS } : null,
    };
  }

  private slowMo(m: { readonly scale: number; readonly time: number }): void {
    if (this.flow.screen !== 'racing') return;
    this.slowScale = Math.min(this.slowTime > 0 ? this.slowScale : 1, m.scale);
    this.slowTime = Math.max(this.slowTime, m.time);
  }

  private ghostProgress(): number | null {
    const g = this.ghost;
    if (!g) return null;
    const p = ghostPose(g, this.world.race.elapsed);
    if (!p) return null;
    const route = this.world.routes[p.route];
    const s = p.route < 0 || !route ? p.s : routeToMainS(route, p.s);
    return s / this.world.rules.finishS;
  }

  private tick(dt: number): void {
    const screen = this.flow.screen;
    const controlsPoll = [this.keyboard.poll(), this.gamepad.poll(), this.touch.poll()];

    this.applyEffect(this.flow.update(dt));
    this.updateCountdown();

    // Slow motion scales simulation time only; the fixed step keeps the simulation deterministic.
    const scale = this.slowTime > 0 ? this.slowScale : 1;
    this.slowTime = Math.max(0, this.slowTime - dt);
    const simDt = dt * scale;
    const steps = this.stepper.advance(simDt);
    const racing = screen === 'racing';
    const simulate = racing || screen === 'countdown' || screen === 'title' || screen === 'finished';
    const controls = racing ? combineControls(controlsPoll) : neutralControls();
    if (simulate) {
      for (let i = 0; i < steps; i++) {
        const events = this.world.step(controls, FIXED_DT, racing);
        for (const e of events) this.onSimEvent(e);
      }
    }

    if (RACE_SCREENS.includes(screen)) {
      this.hud.setGhostProgress(this.ghostProgress());
      this.hud.update(this.world, dt);
    }
    const stats = this.world.character.stats;
    const speedRatio = Math.max(0, this.world.bike.speed) / stats.topSpeed;
    this.audio.updateEngine(speedRatio, controls.throttle);
    const combo = this.world.combo.count > 0 ? (comboMultiplier(this.world.combo) - 1) / 4 : 0;
    this.audio.updateMusic(
      Math.min(1, combo + (speedRatio > 0.85 ? 0.3 : 0)),
      racing && this.world.race.timeLeft <= 10,
    );
    this.renderer.render(simDt);
  }

  private updateCountdown(): void {
    if (this.flow.screen === 'countdown') {
      const n = Math.ceil(this.flow.countdown);
      if (n !== this.lastCountdownShown) {
        this.lastCountdownShown = n;
        this.hud.setCountdown(String(n));
        this.audio.countdownBeep(false);
      }
    } else if (this.lastCountdownShown !== -1) {
      this.lastCountdownShown = -1;
      if (this.flow.screen === 'racing') {
        this.hud.setCountdown(null);
        this.hud.flash(this.i18n.t('hud.go'), 1, 'go');
        this.audio.countdownBeep(true);
      } else this.hud.setCountdown(null);
    }
  }

  private onSimEvent(e: SimEvent): void {
    this.audio.play(e);
    this.renderer.onEvent(e);
    const t = this.i18n.t.bind(this.i18n);
    switch (e.type) {
      case 'checkpoint': {
        this.hud.flash(`${t('hud.checkpoint')}  ${t('hud.extended', { s: e.bonus })}`, 2.2, 'checkpoint');
        const split = this.ghost?.splits[e.index];
        if (split !== undefined) this.hud.showSplit(this.world.race.elapsed - split);
        break;
      }
      case 'hurryUp':
        this.hud.flash(t('hud.hurry'), 1.8, 'danger');
        break;
      case 'crash':
        this.hud.flash(t('hud.crash'), 1.4, 'danger');
        this.renderer.addShake(0.6);
        break;
      case 'jump':
        this.hud.flash(t('hud.jump'), 0.8);
        this.slowMo(SLOWMO_JUMP);
        break;
      case 'nearMiss':
        this.slowMo(SLOWMO_NEAR_MISS);
        break;
      case 'trick':
        this.hud.popTrick(`${t(`trick.${e.kind}` as MessageKey)} +${e.points}  x${e.multiplier}`, e.multiplier);
        break;
      case 'comboBanked': {
        const m = comboMultiplier({ count: e.count });
        if (e.count >= 2) this.hud.flash(t('hud.comboBanked', { m, p: e.points }), 1.3, 'bonus');
        break;
      }
      case 'comboLost':
        this.hud.popTrick(t('hud.comboLost'), 0, 'lost');
        break;
      case 'rivalPassed': {
        const name = this.world.rival ? this.i18n.tk(this.world.rival.character.nameKey) : '';
        this.hud.flash(
          t(e.ahead ? 'hud.rivalAhead' : 'hud.rivalBehind', { name }),
          1.2,
          e.ahead ? 'checkpoint' : 'danger',
        );
        break;
      }
      case 'pickup':
        this.hud.flash(t('hud.explosive'), 1.4, 'bonus');
        break;
      case 'explode':
        this.hud.flash(t('hud.boom', { p: EXPLODE_POINTS }), 1.2, 'bonus');
        break;
      case 'glass':
        this.hud.flash(t('hud.glass'), 1);
        break;
      case 'shortcut':
        if (this.save.discover(this.world.stage.id, e.route)) this.hud.flash(t('hud.newShortcut'), 1.6, 'bonus');
        else this.hud.flash(t('hud.shortcut'), 1.2, 'checkpoint');
        break;
      case 'crossingBell':
        this.hud.flash(t('hud.train'), 1.6, 'danger');
        break;
      case 'finish':
        this.result = this.finishResult(true);
        this.audio.stopEngine();
        this.audio.stopMusic();
        this.flow.notifyFinished();
        break;
      case 'timeUp':
        this.flow.notifyTimeUp();
        break;
      default:
        break;
    }
  }
}

const safeLocalStorage = (): Storage | null => {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
};

const safeSessionStorage = (): Storage | null => {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
};

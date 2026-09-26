import { AudioEngine } from './audio/audio';
import { CHARACTERS } from './content/characters';
import { STAGES } from './content/stages';
import { GameFlow, type FlowEffect, type Screen } from './core/gameFlow';
import { FIXED_DT, FixedStepper } from './core/loop';
import { SaveData } from './core/storage';
import { GamepadInput } from './input/gamepad';
import { KeyboardInput } from './input/keyboard';
import { isTouchDevice, TouchInput } from './input/touch';
import { combineControls, neutralControls, type MenuAction } from './input/types';
import { GameRenderer } from './render/renderer';
import type { SimEvent } from './sim/events';
import { EXPLODE_POINTS, World } from './sim/world';
import { Hud } from './ui/hud';
import { detectLocale, I18n } from './ui/i18n';
import { renderScreen, type ResultInfo } from './ui/screens';

const RACE_SCREENS: readonly Screen[] = ['countdown', 'racing', 'paused', 'continue'];

/** Composition root: wires flow, simulation, rendering, input, audio and UI. */
export class Game {
  private readonly save = new SaveData(safeLocalStorage());
  private readonly i18n: I18n;
  private readonly flow = new GameFlow({ characterCount: CHARACTERS.length, stageCount: STAGES.length });
  private readonly renderer: GameRenderer;
  private readonly audio = new AudioEngine();
  private readonly keyboard: KeyboardInput;
  private readonly gamepad: GamepadInput;
  private readonly touch: TouchInput;
  private readonly hud: Hud;
  private readonly screenRoot: HTMLElement;
  private readonly stepper = new FixedStepper();
  private readonly isTouch = isTouchDevice();
  private world: World;
  private result: ResultInfo | null = null;
  private lastFrame = 0;
  private lastCountdownShown = -1;

  constructor(private readonly root: HTMLElement) {
    this.i18n = new I18n(this.save.settings.locale ?? detectLocale(navigator.languages ?? [navigator.language]));
    document.documentElement.lang = this.i18n.locale;
    this.audio.setEnabled(this.save.settings.sound);

    const canvas = root.querySelector<HTMLCanvasElement>('#game-canvas')!;
    this.screenRoot = root.querySelector<HTMLElement>('#screens')!;
    const overlay = root.querySelector<HTMLElement>('#overlay')!;

    const params = new URLSearchParams(location.search);
    this.renderer = new GameRenderer(canvas, params.get('quality') === 'low' ? 'low' : 'high');
    this.world = this.previewWorld();
    this.renderer.setWorld(this.world);

    this.hud = new Hud(overlay, this.i18n, () => this.onMenu('pause'));
    this.touch = new TouchInput(overlay, this.touchLabels());
    root.classList.toggle('is-touch', this.isTouch);

    this.keyboard = new KeyboardInput(window, (a) => this.onMenu(a));
    this.gamepad = new GamepadInput((a) => this.onMenu(a));

    window.addEventListener('resize', () => this.renderer.resize());
    window.addEventListener('pointerdown', () => this.audio.unlock(), { passive: true });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.flow.screen === 'racing') this.onMenu('pause');
    });

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
    const frame = (t: number): void => {
      const dt = this.lastFrame ? Math.min((t - this.lastFrame) / 1000, 0.1) : 0;
      this.lastFrame = t;
      this.tick(dt);
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }

  private previewWorld(): World {
    return new World(STAGES[this.flow.stageIndex]!, CHARACTERS[this.flow.characterIndex]!);
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
      case 'restartRace':
        this.world = new World(STAGES[this.flow.stageIndex]!, CHARACTERS[this.flow.characterIndex]!);
        this.renderer.setWorld(this.world);
        this.hud.setWorld(this.world);
        this.result = null;
        this.stepper.reset();
        this.audio.startEngine();
        break;
      case 'continueRace':
        this.world.continueFromCheckpoint();
        this.audio.startEngine();
        break;
      case 'quitRace':
        this.audio.stopEngine();
        this.world = this.previewWorld();
        this.renderer.setWorld(this.world);
        break;
    }
  }

  private onScreen(s: Screen): void {
    if (s === 'characterSelect') {
      const c = CHARACTERS[this.flow.characterIndex]!;
      if (this.world.character.id !== c.id) {
        this.world = new World(STAGES[this.flow.stageIndex]!, c);
        this.renderer.setWorld(this.world);
      }
    }
    if (s === 'gameOver' && !this.result) this.result = this.finishResult(false);
    if (s === 'gameOver' || s === 'title') this.audio.stopEngine();

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
        stageLength: this.world.track.length,
        isTouch: this.isTouch,
      },
      {
        action: (a) => this.onMenu(a),
        selectCharacter: (i) => this.applyEffect(this.flow.pickCharacter(i)),
        selectStage: (i) => this.applyEffect(this.flow.pickStage(i)),
        pauseItem: (item) => this.applyEffect(this.flow.selectPause(item)),
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

  private finishResult(finished: boolean): ResultInfo {
    const score = this.world.score;
    const time = this.world.race.elapsed;
    const newBest = this.save.submit(this.world.stage.id, { score, time });
    return { score, time, newBest: newBest && (finished || score > 0) };
  }

  private tick(dt: number): void {
    const screen = this.flow.screen;
    const controlsPoll = [this.keyboard.poll(), this.gamepad.poll(), this.touch.poll()];

    this.applyEffect(this.flow.update(dt));
    this.updateCountdown();

    const steps = this.stepper.advance(dt);
    const racing = screen === 'racing';
    const simulate = racing || screen === 'countdown' || screen === 'title' || screen === 'finished';
    const controls = racing ? combineControls(controlsPoll) : neutralControls();
    if (simulate) {
      for (let i = 0; i < steps; i++) {
        const events = this.world.step(controls, FIXED_DT, racing);
        for (const e of events) this.onSimEvent(e);
      }
    }

    if (RACE_SCREENS.includes(screen)) this.hud.update(this.world, dt);
    const stats = this.world.character.stats;
    this.audio.updateEngine(Math.max(0, this.world.bike.speed) / stats.topSpeed, controls.throttle);
    this.renderer.render(dt);
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
      case 'checkpoint':
        this.hud.flash(`${t('hud.checkpoint')}  ${t('hud.extended', { s: e.bonus })}`, 2.2, 'checkpoint');
        break;
      case 'hurryUp':
        this.hud.flash(t('hud.hurry'), 1.8, 'danger');
        break;
      case 'crash':
        this.hud.flash(t('hud.crash'), 1.4, 'danger');
        this.renderer.addShake(0.6);
        break;
      case 'jump':
        this.hud.flash(t('hud.jump'), 0.8);
        break;
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
        this.hud.flash(t('hud.shortcut'), 1.2, 'checkpoint');
        break;
      case 'finish':
        this.result = this.finishResult(true);
        this.audio.stopEngine();
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

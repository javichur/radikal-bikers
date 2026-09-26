import { MS_TO_KMH } from '../core/math';
import { COMBO_WINDOW, comboMultiplier, comboValue } from '../sim/combo';
import { BIKE } from '../sim/bike';
import type { World } from '../sim/world';
import { h } from './dom';
import type { I18n } from './i18n';

const GAUGE_MAX_KMH = 160;
/** Length of the 270° gauge arc (r = 40). */
const ARC_LEN = 2 * Math.PI * 40 * 0.75;

/** Arcade-style HUD: time, speedometer, score, course progress, banners. */
export class Hud {
  readonly root: HTMLElement;
  private readonly time: HTMLElement;
  private readonly timeLabel: HTMLElement;
  private readonly speed: HTMLElement;
  private readonly speedUnit: HTMLElement;
  private readonly gaugeArc: SVGPathElement;
  private readonly score: HTMLElement;
  private readonly scoreLabel: HTMLElement;
  private readonly progressFill: HTMLElement;
  private readonly progressMarks: HTMLElement;
  private readonly banner: HTMLElement;
  private readonly countdown: HTMLElement;
  private readonly explosive: HTMLElement;
  private readonly explosiveLabel: HTMLElement;
  private readonly explosiveTime: HTMLElement;
  private readonly turbo: HTMLElement;
  private readonly turboLabel: HTMLElement;
  private readonly turboTime: HTMLElement;
  private readonly combo: HTMLElement;
  private readonly comboMult: HTMLElement;
  private readonly comboPoints: HTMLElement;
  private readonly comboLabel: HTMLElement;
  private readonly comboBar: HTMLElement;
  private readonly trick: HTMLElement;
  private readonly record: HTMLElement;
  private readonly rival: HTMLElement;
  private readonly rivalMark: HTMLElement;
  private readonly ghostMark: HTMLElement;
  private readonly split: HTMLElement;
  private readonly speedLines: HTMLElement;
  private bannerTimer = 0;
  private trickTimer = 0;
  private splitTimer = 0;
  private best: number | null = null;
  readonly pauseButton: HTMLButtonElement;

  constructor(
    parent: HTMLElement,
    private readonly i18n: I18n,
    onPause: () => void,
  ) {
    this.timeLabel = h('div', { class: 'hud-label' });
    this.time = h('div', { class: 'hud-time', 'data-testid': 'hud-time' });
    this.scoreLabel = h('div', { class: 'hud-label' });
    this.score = h('div', { class: 'hud-score' });
    this.speed = h('div', { class: 'hud-speed-value', 'data-testid': 'hud-speed' });
    this.speedUnit = h('div', { class: 'hud-speed-unit' });
    this.progressFill = h('div', { class: 'hud-progress-fill' });
    this.progressMarks = h('div', { class: 'hud-progress-marks' });
    this.banner = h('div', { class: 'hud-banner' });
    this.countdown = h('div', { class: 'hud-countdown' });
    this.explosiveLabel = h('span', { class: 'hud-explosive-label' });
    this.explosiveTime = h('span', { class: 'hud-explosive-time' });
    this.explosive = h(
      'div',
      { class: 'hud-explosive', 'data-testid': 'hud-explosive' },
      h('span', { class: 'hud-explosive-icon' }, 'TNT'),
      this.explosiveLabel,
      this.explosiveTime,
    );
    this.turboLabel = h('span', { class: 'hud-explosive-label' });
    this.turboTime = h('span', { class: 'hud-explosive-time' });
    this.turbo = h(
      'div',
      { class: 'hud-explosive hud-turbo', 'data-testid': 'hud-turbo' },
      h('span', { class: 'hud-explosive-icon' }, '🚀'),
      this.turboLabel,
      this.turboTime,
    );
    this.comboMult = h('span', { class: 'hud-combo-mult' });
    this.comboPoints = h('span', { class: 'hud-combo-points' });
    this.comboLabel = h('span', { class: 'hud-combo-label' });
    this.comboBar = h('span', { class: 'hud-combo-fill' });
    this.combo = h(
      'div',
      { class: 'hud-combo', 'data-testid': 'hud-combo' },
      this.comboLabel,
      this.comboMult,
      this.comboPoints,
      h('span', { class: 'hud-combo-bar' }, this.comboBar),
    );
    this.trick = h('div', { class: 'hud-trick' });
    this.record = h('div', { class: 'hud-record', 'data-testid': 'hud-record' });
    this.rival = h('div', { class: 'hud-rival', 'data-testid': 'hud-rival' });
    this.rivalMark = h('span', { class: 'hud-progress-rival' });
    this.ghostMark = h('span', { class: 'hud-progress-ghost' });
    this.split = h('div', { class: 'hud-split' });
    this.speedLines = h('div', { class: 'hud-speedlines' });
    this.pauseButton = h(
      'button',
      { class: 'hud-pause', type: 'button', 'aria-label': 'Pause', onclick: onPause },
      'II',
    );

    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('viewBox', '0 0 100 100');
    svg.setAttribute('class', 'hud-gauge');
    const arcPath = 'M 21.7 78.3 A 40 40 0 1 1 78.3 78.3';
    const bg = document.createElementNS(svgNS, 'path');
    bg.setAttribute('d', arcPath);
    bg.setAttribute('class', 'gauge-bg');
    this.gaugeArc = document.createElementNS(svgNS, 'path');
    this.gaugeArc.setAttribute('d', arcPath);
    this.gaugeArc.setAttribute('class', 'gauge-fg');
    this.gaugeArc.style.strokeDasharray = `0 ${ARC_LEN * 2}`;
    svg.append(bg, this.gaugeArc);

    this.root = h(
      'div',
      { class: 'hud', 'data-testid': 'hud' },
      this.speedLines,
      h('div', { class: 'hud-top-left' }, this.timeLabel, this.time),
      h(
        'div',
        { class: 'hud-top-center' },
        h('div', { class: 'hud-progress' }, this.progressFill, this.progressMarks, this.ghostMark, this.rivalMark),
        this.rival,
        this.split,
      ),
      h('div', { class: 'hud-top-right' }, this.scoreLabel, this.score, this.record, this.pauseButton),
      h('div', { class: 'hud-speedo' }, svg, h('div', { class: 'hud-speed-text' }, this.speed, this.speedUnit)),
      this.combo,
      this.trick,
      this.explosive,
      this.turbo,
      this.banner,
      this.countdown,
    );
    parent.append(this.root);
    this.refreshLabels();
  }

  refreshLabels(): void {
    this.timeLabel.textContent = this.i18n.t('hud.time');
    this.scoreLabel.textContent = this.i18n.t('hud.score');
    this.speedUnit.textContent = this.i18n.t('hud.speed');
    this.explosiveLabel.textContent = this.i18n.t('hud.explosive');
    this.turboLabel.textContent = this.i18n.t('hud.turbo');
    this.comboLabel.textContent = this.i18n.t('hud.combo');
  }

  /** Best score of the stage, shown under the score (null hides it). */
  setBest(best: number | null): void {
    this.best = best;
    this.record.classList.toggle('show', best !== null);
  }

  /** Ghost position as course fraction (null hides the marker). */
  setGhostProgress(p: number | null): void {
    this.ghostMark.classList.toggle('show', p !== null);
    if (p !== null) this.ghostMark.style.left = `${Math.min(1, p) * 100}%`;
  }

  /** Small pop-up for a trick. */
  popTrick(text: string, multiplier: number, variant = ''): void {
    this.trick.textContent = text;
    this.trick.className = `hud-trick show m${Math.min(5, multiplier)} ${variant}`;
    this.trickTimer = 0.9;
  }

  /** Checkpoint split against the ghost (negative = ahead). */
  showSplit(delta: number): void {
    this.split.textContent = `${delta <= 0 ? '−' : '+'}${Math.abs(delta).toFixed(2)}`;
    this.split.className = `hud-split show ${delta <= 0 ? 'ahead' : 'behind'}`;
    this.splitTimer = 3;
  }

  setWorld(world: World): void {
    this.split.classList.remove('show');
    this.trick.classList.remove('show');
    this.bannerTimer = 0;
    this.banner.classList.remove('show');
    const rival = world.rival;
    this.rival.classList.toggle('show', !!rival);
    this.rivalMark.classList.toggle('show', !!rival);
    this.progressMarks.replaceChildren(
      ...world.rules.checkpoints.map((c) =>
        h('span', { class: 'hud-progress-mark', style: `left:${(c.s / world.rules.finishS) * 100}%` }),
      ),
    );
  }

  setVisible(v: boolean): void {
    this.root.classList.toggle('visible', v);
  }

  flash(text: string, seconds = 1.6, variant = ''): void {
    this.banner.textContent = text;
    this.banner.className = `hud-banner show ${variant}`;
    this.bannerTimer = seconds;
  }

  setCountdown(text: string | null): void {
    this.countdown.textContent = text ?? '';
    this.countdown.classList.toggle('show', !!text);
  }

  update(world: World, dt: number): void {
    const r = world.race;
    const tl = Math.ceil(r.timeLeft);
    this.time.textContent = String(tl);
    this.time.classList.toggle('danger', r.timeLeft <= 10);
    const kmh = Math.max(0, Math.round(world.bike.speed * MS_TO_KMH));
    this.speed.textContent = String(kmh);
    const frac = Math.min(1, kmh / GAUGE_MAX_KMH);
    this.gaugeArc.style.strokeDasharray = `${ARC_LEN * frac} ${ARC_LEN * 2}`;
    const score = world.score;
    this.score.textContent = String(score);
    if (this.best !== null) {
      const gap = score - this.best;
      this.record.textContent = `${this.i18n.t('hud.record')} ${gap >= 0 ? '+' : '−'}${Math.abs(gap)}`;
      this.record.classList.toggle('beaten', gap > 0);
    }
    this.progressFill.style.width = `${world.progress * 100}%`;
    const rival = world.rival;
    if (rival) {
      const gap = world.rivalGap ?? 0;
      const pos = gap > 0 ? '2º' : '1º';
      this.rival.textContent = `${pos} · ${this.i18n.tk(rival.character.nameKey)} ${gap > 0 ? '+' : '−'}${Math.round(Math.abs(gap))} m`;
      this.rival.classList.toggle('leading', gap <= 0);
      this.rivalMark.style.left = `${Math.min(1, rival.bike.s / world.rules.finishS) * 100}%`;
    }
    const c = world.combo;
    this.combo.classList.toggle('show', c.count > 0);
    if (c.count > 0) {
      const m = comboMultiplier(c);
      this.comboMult.textContent = `x${m}`;
      this.comboPoints.textContent = String(comboValue(c));
      this.comboBar.style.width = `${Math.max(0, c.timer / COMBO_WINDOW) * 100}%`;
      this.combo.dataset.mult = String(m);
    }
    const speedRatio = Math.max(0, world.bike.speed) / (world.character.stats.topSpeed * BIKE.wheelieBoost);
    this.speedLines.style.opacity = String(Math.max(0, (speedRatio - 0.7) / 0.3) * 0.8);
    if (this.trickTimer > 0) {
      this.trickTimer -= dt;
      if (this.trickTimer <= 0) this.trick.classList.remove('show');
    }
    if (this.splitTimer > 0) {
      this.splitTimer -= dt;
      if (this.splitTimer <= 0) this.split.classList.remove('show');
    }
    const boom = world.bike.explosive;
    this.explosive.classList.toggle('show', boom > 0);
    this.explosive.classList.toggle('ending', boom > 0 && boom <= 2);
    if (boom > 0) this.explosiveTime.textContent = boom.toFixed(1);
    const turbo = world.bike.turbo;
    this.turbo.classList.toggle('show', turbo > 0);
    this.turbo.classList.toggle('ending', turbo > 0 && turbo <= 1.5);
    if (turbo > 0) this.turboTime.textContent = turbo.toFixed(1);
    if (this.bannerTimer > 0) {
      this.bannerTimer -= dt;
      if (this.bannerTimer <= 0) this.banner.classList.remove('show');
    }
  }
}

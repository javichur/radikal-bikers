import { MS_TO_KMH } from '../core/math';
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
  private bannerTimer = 0;
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
      h('div', { class: 'hud-top-left' }, this.timeLabel, this.time),
      h('div', { class: 'hud-top-center' }, h('div', { class: 'hud-progress' }, this.progressFill, this.progressMarks)),
      h('div', { class: 'hud-top-right' }, this.scoreLabel, this.score, this.pauseButton),
      h('div', { class: 'hud-speedo' }, svg, h('div', { class: 'hud-speed-text' }, this.speed, this.speedUnit)),
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
  }

  setWorld(world: World): void {
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
    this.score.textContent = String(world.score);
    this.progressFill.style.width = `${world.progress * 100}%`;
    if (this.bannerTimer > 0) {
      this.bannerTimer -= dt;
      if (this.bannerTimer <= 0) this.banner.classList.remove('show');
    }
  }
}

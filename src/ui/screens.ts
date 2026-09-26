import { CHARACTERS, normalisedStats } from '../content/characters';
import { STAGES } from '../content/stages';
import { CONTINUE_SECONDS, GameFlow, type Screen } from '../core/gameFlow';
import type { MenuAction } from '../input/types';
import { h } from './dom';
import type { I18n } from './i18n';

export interface ResultInfo {
  readonly score: number;
  readonly time: number;
  readonly newBest: boolean;
}

export interface ScreenContext {
  readonly flow: GameFlow;
  readonly i18n: I18n;
  readonly soundOn: boolean;
  readonly bestScore: number | null;
  readonly result: ResultInfo | null;
  /** Course length of every stage, metres (same order as STAGES). */
  readonly stageLengths: readonly number[];
  readonly isTouch: boolean;
}

export interface ScreenCallbacks {
  action(a: MenuAction): void;
  selectCharacter(i: number): void;
  selectStage(i: number): void;
  pauseItem(item: (typeof GameFlow.PAUSE_ITEMS)[number]): void;
  toggleLocale(): void;
  toggleSound(): void;
}

const MAX_DIFFICULTY = 5;

export const formatTime = (seconds: number): string => {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  const cs = Math.floor((seconds * 100) % 100);
  return `${m}'${String(s).padStart(2, '0')}"${String(cs).padStart(2, '0')}`;
};

const statBar = (label: string, value: number): HTMLElement =>
  h(
    'div',
    { class: 'stat' },
    h('span', { class: 'stat-label' }, label),
    h('span', { class: 'stat-bar' }, h('span', { class: 'stat-fill', style: `width:${Math.round(value * 100)}%` })),
  );

/** Renders menu/overlay screens into `root` as plain DOM. */
export const renderScreen = (root: HTMLElement, screen: Screen, ctx: ScreenContext, cb: ScreenCallbacks): void => {
  const { i18n, flow } = ctx;
  const t = i18n.t.bind(i18n);
  root.replaceChildren();
  root.dataset.screen = screen;

  const btn = (label: string, onClick: () => void, cls = 'btn'): HTMLButtonElement =>
    h('button', { class: cls, type: 'button', onclick: (e: Event) => (e.stopPropagation(), onClick()) }, label);

  switch (screen) {
    case 'title': {
      root.append(
        h(
          'div',
          { class: 'panel title-screen', onclick: () => cb.action('confirm') },
          h('h1', { class: 'logo' }, h('span', {}, 'RADIKAL'), h('span', { class: 'logo-2' }, 'RIDERS')),
          h('p', { class: 'subtitle' }, t('title.subtitle')),
          h('p', { class: 'blink press' }, t('title.press')),
          ctx.bestScore !== null ? h('p', { class: 'best' }, `${t('title.best')}: ${ctx.bestScore}`) : null,
          h(
            'div',
            { class: 'title-options' },
            btn(`${t('title.language')}: ${i18n.locale.toUpperCase()}`, cb.toggleLocale, 'btn small'),
            btn(`${t('title.sound')}: ${ctx.soundOn ? t('title.on') : t('title.off')}`, cb.toggleSound, 'btn small'),
          ),
          ctx.isTouch ? null : h('p', { class: 'hint' }, t('controls.keyboard')),
        ),
      );
      break;
    }
    case 'characterSelect': {
      const cards = CHARACTERS.map((c, i) => {
        const st = normalisedStats(c.stats);
        const hex = `#${c.colors.body.toString(16).padStart(6, '0')}`;
        return h(
          'div',
          {
            class: `card${i === flow.characterIndex ? ' selected' : ''}`,
            style: `--accent:${hex}`,
            'data-character': c.id,
            onclick: () => cb.selectCharacter(i),
          },
          h('h2', {}, i18n.tk(c.nameKey)),
          h('p', { class: 'bio' }, i18n.tk(c.bioKey)),
          statBar(t('stat.speed'), st.speed),
          statBar(t('stat.accel'), st.accel),
          statBar(t('stat.handling'), st.handling),
          statBar(t('stat.weight'), st.weight),
        );
      });
      root.append(
        h(
          'div',
          { class: 'panel select-screen' },
          h('h1', { class: 'screen-title' }, t('select.character')),
          h('div', { class: 'cards' }, ...cards),
          h(
            'div',
            { class: 'actions' },
            btn(t('select.back'), () => cb.action('back'), 'btn ghost'),
            btn(t('select.confirm'), () => cb.action('confirm')),
          ),
        ),
      );
      break;
    }
    case 'stageSelect': {
      const cards = STAGES.map((s, i) =>
        h(
          'div',
          {
            class: `card stage-card${i === flow.stageIndex ? ' selected' : ''}`,
            'data-stage': s.id,
            onclick: () => cb.selectStage(i),
          },
          h('h2', {}, i18n.tk(s.nameKey)),
          h(
            'p',
            { class: 'meta difficulty', title: `${t('stage.difficulty')}: ${s.difficulty}/${MAX_DIFFICULTY}` },
            `${t('stage.difficulty')}: `,
            h('span', { class: 'stars' }, '★'.repeat(s.difficulty) + '☆'.repeat(MAX_DIFFICULTY - s.difficulty)),
          ),
          h('p', { class: 'bio' }, i18n.tk(s.descriptionKey)),
          h('p', { class: 'meta' }, `${t('stage.length')}: ${((ctx.stageLengths[i] ?? 0) / 1000).toFixed(1)} km`),
          h('p', { class: 'meta' }, `${t('stage.checkpoints')}: ${s.checkpoints.length}`),
        ),
      );
      root.append(
        h(
          'div',
          { class: 'panel select-screen' },
          h('h1', { class: 'screen-title' }, t('select.stage')),
          h('div', { class: 'cards stage-cards' }, ...cards),
          h(
            'div',
            { class: 'actions' },
            btn(t('select.back'), () => cb.action('back'), 'btn ghost'),
            btn(t('select.confirm'), () => cb.action('confirm')),
          ),
        ),
      );
      break;
    }
    case 'paused': {
      const labels = { resume: t('pause.resume'), restart: t('pause.restart'), quit: t('pause.quit') };
      root.append(
        h(
          'div',
          { class: 'panel modal' },
          h('h1', { class: 'screen-title' }, t('pause.title')),
          ...GameFlow.PAUSE_ITEMS.map((item, i) =>
            btn(labels[item], () => cb.pauseItem(item), `btn wide${i === flow.pauseIndex ? ' focused' : ''}`),
          ),
        ),
      );
      break;
    }
    case 'continue': {
      const n = Math.max(0, Math.min(CONTINUE_SECONDS, Math.ceil(flow.continueTimer)));
      root.append(
        h(
          'div',
          { class: 'panel modal continue', onclick: () => cb.action('confirm') },
          h('h1', { class: 'screen-title' }, t('continue.title')),
          h('div', { class: 'big-number' }, String(n)),
          h('p', { class: 'blink' }, t('continue.hint')),
        ),
      );
      break;
    }
    case 'gameOver':
    case 'finished': {
      const r = ctx.result;
      root.append(
        h(
          'div',
          { class: `panel modal result ${screen}`, onclick: () => cb.action('confirm') },
          h('h1', { class: 'screen-title' }, t(screen === 'finished' ? 'finish.title' : 'gameover.title')),
          r ? h('p', {}, `${t('result.time')}: ${formatTime(r.time)}`) : null,
          r ? h('p', { class: 'score' }, `${t('result.score')}: ${r.score}`) : null,
          r?.newBest ? h('p', { class: 'new-best blink' }, t('result.newBest')) : null,
          h('p', { class: 'hint' }, t('result.again')),
        ),
      );
      break;
    }
    case 'countdown':
    case 'racing':
      break;
  }
};

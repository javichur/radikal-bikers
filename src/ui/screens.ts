import { countBits, type ChallengeDef, type Grade } from '../content/challenges';
import { CHARACTERS, normalisedStats } from '../content/characters';
import { levelFor, levelProgress, PAINTS, paintUnlocked, rankKey } from '../content/progression';
import { STAGES, type StageDef } from '../content/stages';
import { CONTINUE_SECONDS, GameFlow, type Screen } from '../core/gameFlow';
import type { Profile } from '../core/storage';
import type { MenuAction } from '../input/types';
import { h } from './dom';
import type { I18n, MessageKey } from './i18n';

export interface ResultInfo {
  readonly score: number;
  readonly time: number;
  readonly newBest: boolean;
  readonly finished: boolean;
  readonly grade: Grade | null;
  readonly challenges: readonly ChallengeDef[];
  /** Challenges completed in this run / completed for the first time. */
  readonly mask: number;
  readonly fresh: number;
  readonly xp: number;
  readonly levelBefore: number;
  readonly levelAfter: number;
  /** i18n keys of riders / stages unlocked by this run. */
  readonly unlocked: readonly string[];
  /** Points short of the best score (null when it's a new best or there was none). */
  readonly toBest: number | null;
  /** Seconds vs the ghost's time (negative = faster), when delivered. */
  readonly vsGhost: number | null;
  readonly bestCombo: number;
  readonly nearMisses: number;
  readonly rival: { readonly nameKey: string; readonly won: boolean; readonly points: number } | null;
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
  readonly profile: Readonly<Profile>;
  readonly totalStars: number;
  readonly starsOf: (stage: string) => number;
  readonly discoveredOf: (stage: string) => number;
  readonly bestOf: (stage: string) => number | null;
  readonly paintOf: (character: string) => number;
  readonly isLocked: (kind: 'character' | 'stage', index: number) => boolean;
}

export interface ScreenCallbacks {
  action(a: MenuAction): void;
  selectCharacter(i: number): void;
  selectStage(i: number): void;
  pauseItem(item: (typeof GameFlow.PAUSE_ITEMS)[number]): void;
  resultItem(item: 'again' | 'menu'): void;
  cyclePaint(dir: 1 | -1): void;
  toggleLocale(): void;
  toggleSound(): void;
}

const MAX_DIFFICULTY = 5;
export const challengeLabel = (i18n: I18n, c: ChallengeDef): string =>
  i18n.t(`challenge.${c.kind}` as MessageKey, { n: c.target });

export const starsText = (mask: number, total = 3): string =>
  Array.from({ length: total }, (_, i) => (mask & (1 << i) ? '★' : '☆')).join('');

export const MAX_STARS = STAGES.reduce((n, s) => n + s.challenges.length, 0);

const hexColor = (c: number): string => `#${c.toString(16).padStart(6, '0')}`;

const challengeList = (i18n: I18n, stage: Pick<StageDef, 'challenges'>, mask: number, fresh = 0): HTMLElement =>
  h(
    'ul',
    { class: 'challenges' },
    ...stage.challenges.map((c, i) =>
      h(
        'li',
        { class: mask & (1 << i) ? 'done' : '' },
        h('span', { class: 'star' }, mask & (1 << i) ? '★' : '☆'),
        ` ${challengeLabel(i18n, c)}`,
        fresh & (1 << i) ? h('span', { class: 'tag' }, i18n.t('result.newStar')) : null,
      ),
    ),
  );

const xpBar = (xp: number): HTMLElement =>
  h(
    'span',
    { class: 'xp-bar' },
    h('span', { class: 'xp-fill', style: `width:${Math.round(levelProgress(xp) * 100)}%` }),
  );

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

  const profileBlock = (): HTMLElement => {
    const p = ctx.profile;
    const level = levelFor(p.xp);
    return h(
      'div',
      { class: 'profile', 'data-testid': 'profile' },
      h('p', { class: 'rank' }, `${t('profile.level', { l: level })} · ${i18n.tk(rankKey(level))}`, xpBar(p.xp)),
      h(
        'p',
        { class: 'profile-stats' },
        `★ ${ctx.totalStars}/${MAX_STARS} · ${t('profile.delivered')}: ${p.delivered} · ${t('profile.km')}: ${(p.distance / 1000).toFixed(1)} · ${t('profile.nearMisses')}: ${p.nearMisses} · ${t('profile.bestCombo')}: ${p.bestCombo}`,
      ),
    );
  };

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
          profileBlock(),
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
      const level = levelFor(ctx.profile.xp);
      const cards = CHARACTERS.map((c, i) => {
        const st = normalisedStats(c.stats);
        const locked = ctx.isLocked('character', i);
        const paint = PAINTS[ctx.paintOf(c.id)] ?? PAINTS[0]!;
        const selected = i === flow.characterIndex;
        const paintRow =
          selected && !locked
            ? h(
                'div',
                { class: 'paints' },
                h('span', { class: 'paint-label' }, `${t('paint.label')}: ${i18n.tk(paint.nameKey)}`),
                h(
                  'span',
                  { class: 'swatches' },
                  ...PAINTS.map((pt, j) =>
                    h(
                      'span',
                      {
                        class: `swatch${j === ctx.paintOf(c.id) ? ' on' : ''}${paintUnlocked(j, level) ? '' : ' locked'}`,
                        style: `background:${hexColor(pt.color ?? c.colors.body)}`,
                        title: paintUnlocked(j, level) ? i18n.tk(pt.nameKey) : t('paint.level', { l: pt.level }),
                      },
                      paintUnlocked(j, level) ? '' : '🔒',
                    ),
                  ),
                ),
                ctx.isTouch
                  ? h(
                      'span',
                      { class: 'paint-buttons' },
                      btn('◀', () => cb.cyclePaint(-1), 'btn small'),
                      btn('▶', () => cb.cyclePaint(1), 'btn small'),
                    )
                  : h('span', { class: 'hint' }, t('select.paintHint')),
              )
            : null;
        return h(
          'div',
          {
            class: `card${selected ? ' selected' : ''}${locked ? ' locked' : ''}`,
            style: `--accent:${hexColor(paint.color ?? c.colors.body)}`,
            'data-character': c.id,
            onclick: () => cb.selectCharacter(i),
          },
          h('h2', {}, i18n.tk(c.nameKey)),
          locked ? h('p', { class: 'lock' }, `🔒 ${t('select.locked', { n: c.unlockStars })}`) : null,
          h('p', { class: 'bio' }, i18n.tk(c.bioKey)),
          statBar(t('stat.speed'), st.speed),
          statBar(t('stat.accel'), st.accel),
          statBar(t('stat.handling'), st.handling),
          statBar(t('stat.weight'), st.weight),
          paintRow,
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
      const cards = STAGES.map((s, i) => {
        const locked = ctx.isLocked('stage', i);
        const stars = ctx.starsOf(s.id);
        const best = ctx.bestOf(s.id);
        return h(
          'div',
          {
            class: `card stage-card${i === flow.stageIndex ? ' selected' : ''}${locked ? ' locked' : ''}${s.theme.night ? ' night' : ''}`,
            'data-stage': s.id,
            onclick: () => cb.selectStage(i),
          },
          h('h2', {}, i18n.tk(s.nameKey)),
          h('p', { class: 'stars' }, starsText(stars, s.challenges.length)),
          locked ? h('p', { class: 'lock' }, `🔒 ${t('stage.locked', { n: s.unlockStars })}`) : null,
          h(
            'p',
            { class: 'meta difficulty', title: `${t('stage.difficulty')}: ${s.difficulty}/${MAX_DIFFICULTY}` },
            `${t('stage.difficulty')}: `,
            h('span', { class: 'stars' }, '★'.repeat(s.difficulty) + '☆'.repeat(MAX_DIFFICULTY - s.difficulty)),
          ),
          h('p', { class: 'bio' }, i18n.tk(s.descriptionKey)),
          h('p', { class: 'meta' }, `${t('stage.length')}: ${((ctx.stageLengths[i] ?? 0) / 1000).toFixed(1)} km`),
          h('p', { class: 'meta' }, `${t('stage.checkpoints')}: ${s.checkpoints.length}`),
          h(
            'p',
            { class: 'meta' },
            `${t('stage.shortcutsFound')}: ${countBits(ctx.discoveredOf(s.id))}/${s.shortcuts.length}`,
          ),
          best !== null ? h('p', { class: 'meta' }, `${t('title.best')}: ${best}`) : null,
          h('p', { class: 'meta' }, t('stage.challenges')),
          challengeList(i18n, s, stars),
        );
      });
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
          challengeList(i18n, STAGES[flow.stageIndex]!, ctx.starsOf(STAGES[flow.stageIndex]!.id)),
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
      const signed = (v: number): string => `${v <= 0 ? '−' : '+'}${Math.abs(v).toFixed(2)} s`;
      root.append(
        h(
          'div',
          { class: `panel modal result ${screen}` },
          h('h1', { class: 'screen-title' }, t(screen === 'finished' ? 'finish.title' : 'gameover.title')),
          r?.grade
            ? h('div', { class: `grade grade-${r.grade}`, 'data-testid': 'grade', title: t('result.grade') }, r.grade)
            : null,
          r ? h('p', {}, `${t('result.time')}: ${formatTime(r.time)}`) : null,
          r ? h('p', { class: 'score' }, `${t('result.score')}: ${r.score}`) : null,
          r?.newBest ? h('p', { class: 'new-best blink' }, t('result.newBest')) : null,
          r && r.toBest !== null ? h('p', { class: 'to-best' }, t('result.toBest', { p: r.toBest })) : null,
          r && r.vsGhost !== null
            ? h('p', { class: r.vsGhost <= 0 ? 'ahead' : 'behind' }, t('result.vsGhost', { t: signed(r.vsGhost) }))
            : null,
          r?.rival
            ? h(
                'p',
                { class: r.rival.won ? 'ahead' : 'behind' },
                r.rival.won
                  ? t('result.rivalWin', { name: i18n.tk(r.rival.nameKey), p: r.rival.points })
                  : t('result.rivalLose', { name: i18n.tk(r.rival.nameKey) }),
              )
            : null,
          r
            ? h(
                'p',
                { class: 'meta' },
                `${t('result.bestCombo')}: ${r.bestCombo} · ${t('result.nearMisses')}: ${r.nearMisses}`,
              )
            : null,
          r ? challengeList(i18n, r, r.mask, r.fresh) : null,
          r
            ? h(
                'div',
                { class: 'xp' },
                h('span', {}, t('result.xp', { xp: r.xp })),
                xpBar(ctx.profile.xp),
                h('span', {}, t('profile.level', { l: r.levelAfter })),
              )
            : null,
          r && r.levelAfter > r.levelBefore
            ? h('p', { class: 'level-up blink' }, t('result.levelUp', { l: r.levelAfter }))
            : null,
          r?.unlocked.length
            ? h(
                'p',
                { class: 'unlocked' },
                t('result.unlocked', { name: r.unlocked.map((k) => i18n.tk(k)).join(', ') }),
              )
            : null,
          h(
            'div',
            { class: 'actions' },
            btn(t('result.menu'), () => cb.resultItem('menu'), 'btn ghost'),
            btn(t('result.againBtn'), () => cb.resultItem('again')),
          ),
          ctx.isTouch ? null : h('p', { class: 'hint' }, t('result.again')),
        ),
      );
      break;
    }
    case 'countdown':
    case 'racing':
      break;
  }
};

import type { SimEvent, TrickKind } from './events';

/** Seconds without a new trick after which the pending combo is banked. */
export const COMBO_WINDOW = 3;
/** Maximum multiplier. */
export const COMBO_MAX_MULTIPLIER = 5;
/** Tricks needed to raise the multiplier one step. */
export const TRICKS_PER_LEVEL = 2;

/** Base points of every trick (before the combo multiplier). */
export const TRICK_POINTS: Readonly<Record<TrickKind, number>> = {
  nearMiss: 250,
  wheelie: 150,
  jump: 200,
  glass: 300,
  shortcut: 500,
  explode: 1000,
  turbo: 1500,
};

export interface ComboState {
  /** Tricks chained in the current combo. */
  count: number;
  /** Base points accumulated in the current combo (not yet banked). */
  pending: number;
  /** Seconds left before the combo is banked. */
  timer: number;
  /** Longest chain of the race. */
  best: number;
  /** Largest single banked combo. */
  bestBank: number;
}

export const createCombo = (): ComboState => ({ count: 0, pending: 0, timer: 0, best: 0, bestBank: 0 });

export const comboMultiplier = (c: Pick<ComboState, 'count'>): number =>
  Math.min(COMBO_MAX_MULTIPLIER, 1 + Math.floor(Math.max(0, c.count - 1) / TRICKS_PER_LEVEL));

/** Adds a trick to the chain (optionally scaling its base points, e.g. airtime). */
export const addTrick = (c: ComboState, kind: TrickKind, events: SimEvent[], scale = 1): void => {
  const points = Math.round(TRICK_POINTS[kind] * scale);
  c.count++;
  c.pending += points;
  c.timer = COMBO_WINDOW;
  c.best = Math.max(c.best, c.count);
  events.push({ type: 'trick', kind, points, multiplier: comboMultiplier(c) });
};

/** Cashes in the pending combo. Returns the banked points. */
export const bankCombo = (c: ComboState, events: SimEvent[]): number => {
  if (c.count === 0) return 0;
  const points = c.pending * comboMultiplier(c);
  events.push({ type: 'comboBanked', points, count: c.count });
  c.bestBank = Math.max(c.bestBank, points);
  c.count = 0;
  c.pending = 0;
  c.timer = 0;
  return points;
};

/** A crash loses the pending combo. */
export const breakCombo = (c: ComboState, events: SimEvent[]): void => {
  if (c.count === 0) return;
  events.push({ type: 'comboLost', points: c.pending * comboMultiplier(c) });
  c.count = 0;
  c.pending = 0;
  c.timer = 0;
};

/** Counts down the combo window; returns the points banked this step. */
export const stepCombo = (c: ComboState, dt: number, events: SimEvent[]): number => {
  if (c.count === 0) return 0;
  c.timer -= dt;
  return c.timer <= 0 ? bankCombo(c, events) : 0;
};

/** Current combo value if it were banked now. */
export const comboValue = (c: ComboState): number => c.pending * comboMultiplier(c);

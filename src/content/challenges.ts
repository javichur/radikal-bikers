/** Per-stage challenges: each completed one is worth a star. */
export type ChallengeKind =
  /** Hold a single wheelie for `target` seconds. */
  | 'wheelieStreak'
  /** Take `target` different shortcuts. */
  | 'shortcuts'
  /** Deliver without a single crash. */
  | 'noCrash'
  /** Pass `target` vehicles by a hair. */
  | 'nearMiss'
  /** Chain `target` tricks in a single combo. */
  | 'combo'
  /** Deliver before the rival. */
  | 'beatRival'
  /** Blow up `target` vehicles. */
  | 'explode';

export interface ChallengeDef {
  readonly kind: ChallengeKind;
  readonly target: number;
}

/** What the run achieved (every challenge also requires delivering the pizza). */
export interface RunSummary {
  readonly finished: boolean;
  readonly crashes: number;
  readonly nearMisses: number;
  readonly maxWheelie: number;
  readonly shortcuts: number;
  readonly explosions: number;
  readonly bestCombo: number;
  readonly beatRival: boolean;
}

export const challengeDone = (c: ChallengeDef, r: RunSummary): boolean => {
  if (!r.finished) return false;
  switch (c.kind) {
    case 'wheelieStreak':
      return r.maxWheelie >= c.target;
    case 'shortcuts':
      return r.shortcuts >= c.target;
    case 'noCrash':
      return r.crashes === 0;
    case 'nearMiss':
      return r.nearMisses >= c.target;
    case 'combo':
      return r.bestCombo >= c.target;
    case 'beatRival':
      return r.beatRival;
    case 'explode':
      return r.explosions >= c.target;
  }
};

/** Bitmask of the challenges completed in a run. */
export const challengeMask = (list: readonly ChallengeDef[], r: RunSummary): number =>
  list.reduce((m, c, i) => (challengeDone(c, r) ? m | (1 << i) : m), 0);

export const countBits = (mask: number): number => {
  let n = 0;
  for (let m = mask; m; m &= m - 1) n++;
  return n;
};

export type Grade = 'S' | 'A' | 'B' | 'C';

export interface GradeThresholds {
  readonly s: number;
  readonly a: number;
  readonly b: number;
}

export const gradeFor = (score: number, g: GradeThresholds): Grade =>
  score >= g.s ? 'S' : score >= g.a ? 'A' : score >= g.b ? 'B' : 'C';

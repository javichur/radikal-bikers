import type { Locale } from '../ui/i18n';
import { isGhostData, type GhostData } from '../sim/ghost';

export interface Settings {
  locale: Locale | null;
  sound: boolean;
}

export interface BestRecord {
  score: number;
  time: number;
}

/** Career totals across every race. */
export interface Profile {
  xp: number;
  races: number;
  delivered: number;
  /** Metres ridden. */
  distance: number;
  nearMisses: number;
  explosions: number;
  bestCombo: number;
}

const KEY = 'radikal-riders:v1';
const GHOST_KEY = 'radikal-riders:ghost:';

interface Persisted {
  settings: Settings;
  best: Record<string, BestRecord>;
  profile: Profile;
  /** Completed challenges per stage (bitmask). */
  stars: Record<string, number>;
  /** Shortcuts discovered per stage (bitmask). */
  shortcuts: Record<string, number>;
  /** Selected paint per rider. */
  paints: Record<string, number>;
}

const emptyProfile = (): Profile => ({
  xp: 0,
  races: 0,
  delivered: 0,
  distance: 0,
  nearMisses: 0,
  explosions: 0,
  bestCombo: 0,
});

const defaults = (): Persisted => ({
  settings: { locale: null, sound: true },
  best: {},
  profile: emptyProfile(),
  stars: {},
  shortcuts: {},
  paints: {},
});

const numbers = (v: unknown): Record<string, number> => {
  const out: Record<string, number> = {};
  if (v && typeof v === 'object')
    for (const [k, n] of Object.entries(v)) if (typeof n === 'number' && Number.isFinite(n)) out[k] = n;
  return out;
};

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

/** Tiny typed wrapper around Web Storage (injectable for tests). */
export class SaveData {
  private data: Persisted;

  constructor(private readonly storage: StorageLike | null) {
    this.data = defaults();
    try {
      const raw = storage?.getItem(KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<Persisted>;
        const profile = numbers(parsed.profile);
        this.data = {
          settings: { ...this.data.settings, ...parsed.settings },
          best: { ...parsed.best },
          profile: { ...emptyProfile(), ...profile },
          stars: numbers(parsed.stars),
          shortcuts: numbers(parsed.shortcuts),
          paints: numbers(parsed.paints),
        };
      }
    } catch {
      // Corrupt or unavailable storage: keep defaults.
    }
  }

  get settings(): Readonly<Settings> {
    return this.data.settings;
  }

  updateSettings(patch: Partial<Settings>): void {
    this.data.settings = { ...this.data.settings, ...patch };
    this.save();
  }

  best(key: string): BestRecord | undefined {
    return this.data.best[key];
  }

  /** Stores the record if it beats the previous one. Returns true when it's a new best. */
  submit(key: string, record: BestRecord): boolean {
    const prev = this.data.best[key];
    if (prev && prev.score >= record.score) return false;
    this.data.best[key] = record;
    this.save();
    return true;
  }

  get profile(): Readonly<Profile> {
    return this.data.profile;
  }

  /** Adds a finished (or abandoned) race to the career totals. */
  addRun(run: Omit<Profile, 'races'>): void {
    const p = this.data.profile;
    p.xp += Math.max(0, Math.round(run.xp));
    p.races++;
    p.delivered += run.delivered;
    p.distance += Math.max(0, Math.round(run.distance));
    p.nearMisses += run.nearMisses;
    p.explosions += run.explosions;
    p.bestCombo = Math.max(p.bestCombo, run.bestCombo);
    this.save();
  }

  stars(stage: string): number {
    return this.data.stars[stage] ?? 0;
  }

  /** Merges completed challenges; returns the bits that are new. */
  addStars(stage: string, mask: number): number {
    const prev = this.stars(stage);
    const fresh = mask & ~prev;
    if (fresh) {
      this.data.stars[stage] = prev | mask;
      this.save();
    }
    return fresh;
  }

  discovered(stage: string): number {
    return this.data.shortcuts[stage] ?? 0;
  }

  /** Marks a shortcut as discovered; true the first time. */
  discover(stage: string, route: number): boolean {
    const prev = this.discovered(stage);
    const bit = 1 << route;
    if (prev & bit) return false;
    this.data.shortcuts[stage] = prev | bit;
    this.save();
    return true;
  }

  paint(character: string): number {
    return this.data.paints[character] ?? 0;
  }

  setPaint(character: string, index: number): void {
    this.data.paints[character] = index;
    this.save();
  }

  ghost(stage: string, character: string): GhostData | null {
    try {
      const raw = this.storage?.getItem(`${GHOST_KEY}${stage}:${character}`);
      if (!raw) return null;
      const g: unknown = JSON.parse(raw);
      return isGhostData(g) ? g : null;
    } catch {
      return null;
    }
  }

  /** Keeps the fastest delivery as the ghost. Returns true when it replaced the previous one. */
  submitGhost(stage: string, character: string, ghost: GhostData): boolean {
    const prev = this.ghost(stage, character);
    if (prev && prev.time <= ghost.time) return false;
    try {
      this.storage?.setItem(`${GHOST_KEY}${stage}:${character}`, JSON.stringify(ghost));
    } catch {
      return false;
    }
    return true;
  }

  private save(): void {
    try {
      this.storage?.setItem(KEY, JSON.stringify(this.data));
    } catch {
      // Quota exceeded / private mode: ignore.
    }
  }
}

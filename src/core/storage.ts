import type { Locale } from '../ui/i18n';

export interface Settings {
  locale: Locale | null;
  sound: boolean;
}

export interface BestRecord {
  score: number;
  time: number;
}

const KEY = 'radikal-riders:v1';

interface Persisted {
  settings: Settings;
  best: Record<string, BestRecord>;
}

const defaults = (): Persisted => ({
  settings: { locale: null, sound: true },
  best: {},
});

/** Tiny typed wrapper around Web Storage (injectable for tests). */
export class SaveData {
  private data: Persisted;

  constructor(private readonly storage: Pick<Storage, 'getItem' | 'setItem'> | null) {
    this.data = defaults();
    try {
      const raw = storage?.getItem(KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<Persisted>;
        this.data = {
          settings: { ...this.data.settings, ...parsed.settings },
          best: { ...parsed.best },
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

  private save(): void {
    try {
      this.storage?.setItem(KEY, JSON.stringify(this.data));
    } catch {
      // Quota exceeded / private mode: ignore.
    }
  }
}

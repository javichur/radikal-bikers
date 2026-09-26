import type { Screen } from './gameFlow';

/** Screens where reloading loses nothing (no race or result in progress). */
export const SAFE_RELOAD_SCREENS: readonly Screen[] = ['title', 'characterSelect', 'stageSelect'];

export interface UpdateCheckerOptions {
  /** Version baked into the running bundle. */
  readonly current: string;
  /** Returns the deployed version, or null if unknown (offline, error...). */
  readonly fetchVersion: () => Promise<string | null>;
  readonly getScreen: () => Screen;
  readonly reload: () => void;
  /** Remembers the last version we reloaded for, to avoid loops if a stale page is served. */
  readonly storage?: Pick<Storage, 'getItem' | 'setItem'> | null;
}

const RELOADED_KEY = 'rr.reloadedFor';

/**
 * Detects a newer deploy (iOS home-screen apps are resumed from memory and
 * never refetch index.html) and reloads only while on a menu screen.
 */
export class UpdateChecker {
  private pending: string | null = null;
  private checking = false;

  constructor(private readonly opts: UpdateCheckerOptions) {}

  get updatePending(): boolean {
    return this.pending !== null;
  }

  async check(): Promise<void> {
    if (this.checking) return;
    this.checking = true;
    try {
      const remote = await this.opts.fetchVersion();
      if (!remote || remote === this.opts.current || this.readReloaded() === remote) return;
      this.pending = remote;
      this.onScreen(this.opts.getScreen());
    } catch {
      // Network errors are ignored; we'll retry on the next resume.
    } finally {
      this.checking = false;
    }
  }

  /** Call on every screen change; reloads once a pending update is safe to apply. */
  onScreen(screen: Screen): void {
    if (this.pending === null || !SAFE_RELOAD_SCREENS.includes(screen)) return;
    const pending = this.pending;
    this.pending = null;
    try {
      this.opts.storage?.setItem(RELOADED_KEY, pending);
    } catch {
      // Storage may be unavailable (private mode); reload anyway.
    }
    this.opts.reload();
  }

  private readReloaded(): string | null {
    try {
      return this.opts.storage?.getItem(RELOADED_KEY) ?? null;
    } catch {
      return null;
    }
  }
}

/** Fetches `version.json` bypassing HTTP and browser caches. */
export const fetchDeployedVersion = async (baseUrl: string): Promise<string | null> => {
  try {
    const url = new URL('version.json', baseUrl);
    url.searchParams.set('t', String(Date.now()));
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) return null;
    const data = (await res.json()) as { version?: unknown };
    return typeof data.version === 'string' ? data.version : null;
  } catch {
    return null;
  }
};

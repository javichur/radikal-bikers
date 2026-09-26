import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Screen } from '../../src/core/gameFlow';
import { fetchDeployedVersion, UpdateChecker } from '../../src/core/updateCheck';

const memory = (): Pick<Storage, 'getItem' | 'setItem'> => {
  const data = new Map<string, string>();
  return { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) };
};

const setup = (remote: string | null | Error, screen: Screen = 'title', storage = memory()) => {
  const state = { screen };
  const reload = vi.fn();
  const checker = new UpdateChecker({
    current: 'v1',
    fetchVersion: () => (remote instanceof Error ? Promise.reject(remote) : Promise.resolve(remote)),
    getScreen: () => state.screen,
    reload,
    storage,
  });
  return { checker, reload, state, storage };
};

describe('UpdateChecker', () => {
  it('does nothing when the deployed version matches or is unknown', async () => {
    for (const remote of ['v1', null, new Error('offline')]) {
      const { checker, reload } = setup(remote);
      await checker.check();
      expect(checker.updatePending).toBe(false);
      expect(reload).not.toHaveBeenCalled();
    }
  });

  it('reloads immediately on a menu screen', async () => {
    const { checker, reload } = setup('v2', 'stageSelect');
    await checker.check();
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('defers the reload during a race until back on a menu', async () => {
    const { checker, reload } = setup('v2', 'racing');
    await checker.check();
    expect(checker.updatePending).toBe(true);
    for (const s of ['paused', 'continue', 'countdown', 'finished', 'gameOver'] as const) checker.onScreen(s);
    expect(reload).not.toHaveBeenCalled();
    checker.onScreen('title');
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('does not reload twice for the same version (stale page guard)', async () => {
    const first = setup('v2');
    await first.checker.check();
    expect(first.reload).toHaveBeenCalledTimes(1);
    const second = setup('v2', 'title', first.storage);
    await second.checker.check();
    expect(second.reload).not.toHaveBeenCalled();
  });

  it('replaces a pending update with a newer deployed version', async () => {
    const remotes = ['v2', 'v3'];
    const state = { screen: 'racing' as Screen };
    const reload = vi.fn();
    const storage = memory();
    const checker = new UpdateChecker({
      current: 'v1',
      fetchVersion: () => Promise.resolve(remotes.shift() ?? null),
      getScreen: () => state.screen,
      reload,
      storage,
    });

    await checker.check();
    await checker.check();
    expect(checker.updatePending).toBe(true);
    state.screen = 'title';
    checker.onScreen(state.screen);
    expect(reload).toHaveBeenCalledTimes(1);

    const latest = setup('v3', 'title', storage);
    await latest.checker.check();
    expect(latest.reload).not.toHaveBeenCalled();
  });
});

describe('fetchDeployedVersion', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('bypasses caches and parses the version', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ version: 'abc' }) });
    vi.stubGlobal('fetch', fetchMock);
    await expect(fetchDeployedVersion('https://x.test/game/index.html')).resolves.toBe('abc');
    const [url, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(url.pathname).toBe('/game/version.json');
    expect(url.searchParams.has('t')).toBe(true);
    expect(init.cache).toBe('no-store');
  });

  it('returns null on HTTP errors or bad payloads', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));
    await expect(fetchDeployedVersion('https://x.test/')).resolves.toBeNull();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({}) }));
    await expect(fetchDeployedVersion('https://x.test/')).resolves.toBeNull();
  });
});

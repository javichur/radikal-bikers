import { describe, expect, it } from 'vitest';
import { SaveData } from '../../src/core/storage';

const memory = (): Pick<Storage, 'getItem' | 'setItem'> & { data: Map<string, string> } => {
  const data = new Map<string, string>();
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) };
};

describe('SaveData', () => {
  it('persists settings and best scores', () => {
    const store = memory();
    const a = new SaveData(store);
    expect(a.settings.sound).toBe(true);
    a.updateSettings({ locale: 'es', sound: false });
    expect(a.submit('harbor', { score: 100, time: 90 })).toBe(true);
    expect(a.submit('harbor', { score: 50, time: 80 })).toBe(false);
    const b = new SaveData(store);
    expect(b.settings).toEqual({ locale: 'es', sound: false });
    expect(b.best('harbor')).toEqual({ score: 100, time: 90 });
  });

  it('survives corrupt or missing storage', () => {
    const store = memory();
    store.data.set('radikal-riders:v1', '{not json');
    expect(new SaveData(store).settings.sound).toBe(true);
    const none = new SaveData(null);
    none.updateSettings({ sound: false });
    expect(none.settings.sound).toBe(false);
    const throwing = new SaveData({
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('quota');
      },
    });
    expect(() => throwing.submit('x', { score: 1, time: 1 })).not.toThrow();
  });

  it('tracks career, stars, shortcuts and paints', () => {
    const store = memory();
    const a = new SaveData(store);
    a.addRun({ xp: 1200, delivered: 1, distance: 3000, nearMisses: 4, explosions: 1, bestCombo: 5 });
    a.addRun({ xp: 800, delivered: 0, distance: 1000, nearMisses: 1, explosions: 0, bestCombo: 2 });
    expect(a.addStars('harbor', 0b011)).toBe(0b011);
    expect(a.addStars('harbor', 0b110)).toBe(0b100);
    expect(a.discover('harbor', 1)).toBe(true);
    expect(a.discover('harbor', 1)).toBe(false);
    a.setPaint('rocco', 2);
    const b = new SaveData(store);
    expect(b.profile).toMatchObject({ xp: 2000, races: 2, delivered: 1, distance: 4000, nearMisses: 5, bestCombo: 5 });
    expect(b.stars('harbor')).toBe(0b111);
    expect(b.discovered('harbor')).toBe(0b10);
    expect(b.paint('rocco')).toBe(2);
    expect(b.paint('luna')).toBe(0);
  });

  it('keeps the fastest valid ghost', () => {
    const store = memory();
    const a = new SaveData(store);
    const ghost = (time: number) => ({ version: 1 as const, time, splits: [], frames: [] });
    expect(a.ghost('harbor', 'rocco')).toBeNull();
    expect(a.submitGhost('harbor', 'rocco', ghost(100))).toBe(true);
    expect(a.submitGhost('harbor', 'rocco', ghost(110))).toBe(false);
    expect(a.submitGhost('harbor', 'rocco', ghost(90))).toBe(true);
    expect(new SaveData(store).ghost('harbor', 'rocco')?.time).toBe(90);
    expect(a.ghost('harbor', 'luna')).toBeNull();
    store.data.set('radikal-riders:ghost:harbor:luna', '{"version":1,"frames":"x"}');
    expect(a.ghost('harbor', 'luna')).toBeNull();
  });
});

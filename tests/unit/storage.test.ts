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
});

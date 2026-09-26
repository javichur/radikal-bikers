import { describe, expect, it } from 'vitest';
import { CHARACTERS, getCharacter, normalisedStats } from '../../src/content/characters';
import { getStage, STAGES } from '../../src/content/stages';
import { VEHICLE_KINDS, VEHICLES } from '../../src/content/vehicles';

describe('content', () => {
  it('has two distinct playable riders with normalised stats in range', () => {
    expect(CHARACTERS).toHaveLength(2);
    expect(new Set(CHARACTERS.map((c) => c.id)).size).toBe(2);
    for (const c of CHARACTERS) {
      for (const v of Object.values(normalisedStats(c.stats))) {
        expect(v).toBeGreaterThan(0);
        expect(v).toBeLessThanOrEqual(1);
      }
    }
    expect(getCharacter('luna').id).toBe('luna');
    expect(() => getCharacter('nope')).toThrow();
  });

  it('stages are well formed', () => {
    for (const s of STAGES) {
      const cps = s.checkpoints.map((c) => c.at);
      expect([...cps].sort()).toEqual(cps);
      for (const a of [...cps, ...s.ramps.map((r) => r.at)]) {
        expect(a).toBeGreaterThan(0);
        expect(a).toBeLessThan(1);
      }
      for (const l of [...s.lanes.forward, ...s.lanes.oncoming]) expect(Math.abs(l)).toBeLessThan(s.roadHalfWidth);
      expect(s.lanes.forward.every((l) => l > 0)).toBe(true);
      expect(s.lanes.oncoming.every((l) => l < 0)).toBe(true);
    }
    expect(getStage('harbor').id).toBe('harbor');
    expect(() => getStage('nope')).toThrow();
  });

  it('vehicle speeds are consistent', () => {
    for (const k of VEHICLE_KINDS) {
      const v = VEHICLES[k];
      expect(v.minSpeed).toBeLessThanOrEqual(v.maxSpeed);
      expect(v.weight).toBeGreaterThanOrEqual(0);
    }
  });
});

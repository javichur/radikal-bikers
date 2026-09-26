import { describe, expect, it } from 'vitest';
import { approach, clamp, damp, lerp, wrapAngle } from '../../src/core/math';
import { FixedStepper } from '../../src/core/loop';
import { Rng } from '../../src/core/rng';

describe('math', () => {
  it('clamps, lerps and approaches', () => {
    expect(clamp(5, 0, 1)).toBe(1);
    expect(clamp(-5, 0, 1)).toBe(0);
    expect(lerp(0, 10, 0.25)).toBe(2.5);
    expect(approach(0, 10, 3)).toBe(3);
    expect(approach(10, 0, 3)).toBe(7);
    expect(approach(1, 2, 5)).toBe(2);
  });

  it('wraps angles into (-PI, PI]', () => {
    expect(wrapAngle(3 * Math.PI)).toBeCloseTo(Math.PI);
    expect(wrapAngle(-3 * Math.PI)).toBeCloseTo(Math.PI);
    expect(wrapAngle(0.5)).toBeCloseTo(0.5);
    expect(wrapAngle(-Math.PI / 2 - 2 * Math.PI)).toBeCloseTo(-Math.PI / 2);
  });

  it('damp is frame-rate independent', () => {
    const a = 1 - (1 - damp(5, 1 / 30)) ** 2;
    expect(a).toBeCloseTo(damp(5, 1 / 15));
  });
});

describe('Rng', () => {
  it('is deterministic per seed', () => {
    const a = new Rng(42);
    const b = new Rng(42);
    const seqA = Array.from({ length: 10 }, () => a.next());
    const seqB = Array.from({ length: 10 }, () => b.next());
    expect(seqA).toEqual(seqB);
    expect(new Rng(43).next()).not.toBe(seqA[0]);
  });

  it('stays within ranges', () => {
    const r = new Rng(1);
    for (let i = 0; i < 1000; i++) {
      const v = r.int(2, 4);
      expect(v).toBeGreaterThanOrEqual(2);
      expect(v).toBeLessThanOrEqual(4);
    }
    expect(() => r.pick([])).toThrow();
  });
});

describe('FixedStepper', () => {
  it('accumulates time into fixed steps', () => {
    const s = new FixedStepper(0.01);
    expect(s.advance(0.025)).toBe(2);
    expect(s.alpha).toBeCloseTo(0.5);
    expect(s.advance(0.005)).toBe(1);
  });

  it('caps long frames (tab switch) to avoid spiral of death', () => {
    const s = new FixedStepper(0.01);
    const steps = s.advance(10);
    expect(steps).toBeGreaterThanOrEqual(24);
    expect(steps).toBeLessThanOrEqual(25);
    s.reset();
    expect(s.alpha).toBe(0);
  });
});

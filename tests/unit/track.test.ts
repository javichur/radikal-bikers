import { describe, expect, it } from 'vitest';
import { STAGES } from '../../src/content/stages';
import { NARROW_TAPER } from '../../src/sim/roadWidth';
import { Track } from '../../src/sim/track';

describe('Track', () => {
  it('measures a straight line', () => {
    const t = new Track([
      [0, 0, 0],
      [0, 100, 0],
    ]);
    expect(t.length).toBeCloseTo(100, 0);
    const p = t.sample(50);
    expect(p.x).toBeCloseTo(0);
    expect(p.z).toBeCloseTo(50, 0);
    expect(p.heading).toBeCloseTo(0);
    expect(p.curvature).toBeCloseTo(0);
  });

  it('places positive lateral offsets on the right-hand side', () => {
    const t = new Track([
      [0, 0, 0],
      [0, 100, 0],
    ]);
    // Heading +Z, right-hand side (Y up) is -X.
    expect(t.toWorld(10, 5).x).toBeCloseTo(-5);
  });

  it('reports positive curvature for left turns', () => {
    const t = new Track([
      [0, 0, 0],
      [0, 100, 0],
      [100, 200, 0],
      [200, 200, 0],
    ]);
    // Heading goes from +Z toward +X: heading increases -> positive curvature.
    const mid = t.sample(t.length * 0.5);
    expect(mid.curvature).toBeGreaterThan(0);
    expect(t.sample(t.length).heading).toBeGreaterThan(1);
  });

  it('clamps samples outside the course', () => {
    const t = new Track([
      [0, 0, 0],
      [0, 50, 0],
    ]);
    expect(t.sample(-10).z).toBeCloseTo(0);
    expect(t.sample(1000).z).toBeCloseTo(t.sample(t.length).z);
  });

  it('rejects degenerate input', () => {
    expect(() => new Track([[0, 0, 0]])).toThrow();
  });

  it('builds every stage with a sane length and gentle curvature (tighter only in slow, narrow old-town streets)', () => {
    for (const s of STAGES) {
      const t = new Track(s.controlPoints);
      expect(t.length).toBeGreaterThan(1500);
      const narrow = (d: number): boolean =>
        (s.narrows ?? []).some((n) => d > n.from * t.length - NARROW_TAPER && d < n.to * t.length + NARROW_TAPER);
      for (let d = 0; d < t.length; d += 5) {
        expect(Math.abs(t.sample(d).curvature)).toBeLessThan(narrow(d) ? 1 / 18 : 1 / 40);
      }
    }
  });
});

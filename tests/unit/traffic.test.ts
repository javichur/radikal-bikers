import { describe, expect, it } from 'vitest';
import { Rng } from '../../src/core/rng';
import type { SimEvent } from '../../src/sim/events';
import { overlaps, Traffic, type TrafficConfig } from '../../src/sim/traffic';

const cfg: TrafficConfig = {
  trackLength: 3000,
  forwardLanes: [3, 9],
  oncomingLanes: [-3, -9],
  density: 12,
};

describe('Traffic', () => {
  it('populates deterministically and keeps the start clear', () => {
    const a = new Traffic(cfg, new Rng(7));
    const b = new Traffic(cfg, new Rng(7));
    a.populate(0);
    b.populate(0);
    expect(a.vehicles.map((v) => [v.kind, v.s, v.d])).toEqual(b.vehicles.map((v) => [v.kind, v.s, v.d]));
    expect(a.vehicles.length).toBe(cfg.density);
    for (const v of a.vehicles) {
      expect(v.s).toBeGreaterThanOrEqual(70);
      expect(v.dir === 1 ? cfg.forwardLanes : cfg.oncomingLanes).toContain(v.d);
    }
  });

  it('moves vehicles in their direction of travel', () => {
    const t = new Traffic(cfg, new Rng(3));
    t.populate(500);
    const before = new Map(t.vehicles.map((v) => [v.id, v.s]));
    t.update(500, 100, 0, 0.5, []);
    for (const v of t.vehicles) {
      const prev = before.get(v.id);
      if (prev === undefined) continue;
      expect(Math.sign(v.s - prev)).toBe(v.dir);
    }
  });

  it('recycles vehicles to follow the player and keeps density', () => {
    const t = new Traffic(cfg, new Rng(11));
    t.populate(0);
    for (let s = 0; s < 2000; s += 10) t.update(s, 0, 30, 1 / 3, []);
    expect(t.vehicles.length).toBeGreaterThan(cfg.density / 2);
    for (const v of t.vehicles) expect(v.s).toBeGreaterThan(2000 - 120);
  });

  it('slows down behind a slower leader instead of overlapping', () => {
    const t = new Traffic({ ...cfg, density: 0 }, new Rng(1));
    t.vehicles.push(
      {
        id: 1,
        kind: 'car',
        s: 200,
        d: 3,
        dir: 1,
        speed: 14,
        cruiseSpeed: 14,
        length: 4.4,
        width: 1.9,
        height: 1.5,
        honkCooldown: 0,
        variant: 0,
      },
      {
        id: 2,
        kind: 'bus',
        s: 215,
        d: 3,
        dir: 1,
        speed: 5,
        cruiseSpeed: 5,
        length: 11,
        width: 2.6,
        height: 3.2,
        honkCooldown: 0,
        variant: 0,
      },
    );
    for (let i = 0; i < 300; i++) t.update(150, -9, 0, 1 / 60, []);
    const [car, bus] = t.vehicles;
    expect(car!.speed).toBeLessThan(8);
    expect(bus!.s - car!.s).toBeGreaterThan((4.4 + 11) / 2);
  });

  it('honks at a slow player blocking the lane', () => {
    const t = new Traffic({ ...cfg, density: 0 }, new Rng(1));
    t.vehicles.push({
      id: 9,
      kind: 'taxi',
      s: 100,
      d: 3,
      dir: 1,
      speed: 15,
      cruiseSpeed: 15,
      length: 4.6,
      width: 1.9,
      height: 1.6,
      honkCooldown: 0,
      variant: 0,
    });
    const ev: SimEvent[] = [];
    t.update(110, 3, 2, 1 / 60, ev);
    expect(ev).toContainEqual({ type: 'honk', vehicleId: 9 });
    t.update(110, 3, 2, 1 / 60, ev);
    expect(ev.filter((e) => e.type === 'honk')).toHaveLength(1);
  });

  it('box overlap test', () => {
    const a = { s: 0, d: 0, halfLength: 1, halfWidth: 0.5 };
    expect(overlaps(a, { s: 1.5, d: 0, halfLength: 1, halfWidth: 1 })).toBe(true);
    expect(overlaps(a, { s: 2.5, d: 0, halfLength: 1, halfWidth: 1 })).toBe(false);
    expect(overlaps(a, { s: 0, d: 1.6, halfLength: 1, halfWidth: 1 })).toBe(false);
  });
});

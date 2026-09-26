import { describe, expect, it } from 'vitest';
import { CHARACTERS } from '../../src/content/characters';
import { STAGES } from '../../src/content/stages';
import { FIXED_DT } from '../../src/core/loop';
import { BIKE } from '../../src/sim/bike';
import type { SimEvent } from '../../src/sim/events';
import { inRiver, riverOf } from '../../src/sim/scenery';
import { ROUTE_HALF_WIDTH, SIDEWALK } from '../../src/sim/shortcuts';
import { profileHeight, Track } from '../../src/sim/track';
import { EXPLODE_POINTS, World } from '../../src/sim/world';
import { controls, run } from './helpers';

const stage = STAGES[0]!;
const newWorld = (): World => {
  const w = new World(stage, CHARACTERS[0]!);
  w.traffic.vehicles.length = 0;
  return w;
};

/** Keeps the bike centred on whatever road it is on, full throttle. */
const centre = (w: World): ReturnType<typeof controls> => {
  const b = w.bike;
  const desiredYaw = Math.max(-0.5, Math.min(0.5, -b.d * 0.2));
  return controls({ throttle: 1, steer: Math.max(-1, Math.min(1, (desiredYaw - b.yaw) * 4)) });
};

/** Rides into shortcut `i` from the main road. */
const enterRoute = (w: World, i: number): SimEvent[] => {
  const r = w.routes[i]!;
  const hw = stage.roadHalfWidth;
  w.bike.s = r.entry.from - 12;
  w.bike.d = r.side * (hw - 3);
  w.bike.speed = 18;
  const events: SimEvent[] = [];
  for (let t = 0; t < 3 && w.bike.route < 0; t += FIXED_DT) {
    const b = w.bike;
    const yaw = r.side * 0.35;
    events.push(...w.step(controls({ throttle: 0.6, steer: Math.max(-1, Math.min(1, (yaw - b.yaw) * 4)) }), FIXED_DT));
  }
  return events;
};

describe('elevation profile', () => {
  it('interpolates smoothly between keys', () => {
    const keys = [
      { at: 0, y: 0 },
      { at: 0.5, y: 10 },
      { at: 1, y: 0 },
    ];
    expect(profileHeight(keys, 0)).toBe(0);
    expect(profileHeight(keys, 0.25)).toBeCloseTo(5);
    expect(profileHeight(keys, 0.5)).toBe(10);
    expect(profileHeight(keys, 2)).toBe(0);
    expect(profileHeight([], 0.3)).toBe(0);
  });

  it('exposes height and gradient along the road', () => {
    const t = new Track(
      [
        [0, 0, 0],
        [0, 200, 0],
      ],
      1,
      [
        { at: 0, y: 0 },
        { at: 0.5, y: 10 },
        { at: 1, y: 10 },
      ],
    );
    expect(t.heightAt(t.length * 0.5)).toBeCloseTo(10, 1);
    expect(t.sample(t.length * 0.25).slope).toBeGreaterThan(0.05);
    expect(t.sample(t.length * 0.75).slope).toBeCloseTo(0);
  });

  it('projects world points back to track coordinates', () => {
    const t = new Track(stage.controlPoints);
    for (const [s, d] of [
      [300, 4],
      [1200, -7],
      [2500, 10],
    ] as const) {
      const p = t.toWorld(s, d);
      const q = t.project(p.x, p.z);
      expect(q.s).toBeCloseTo(s, 0);
      expect(q.d).toBeCloseTo(d, 0);
    }
  });
});

describe('circuit layout', () => {
  const w = newWorld();

  it('has several shortcuts (alleys and shops), tunnels, bridges, hills and explosive boxes', () => {
    expect(w.routes.length).toBeGreaterThanOrEqual(3);
    expect(w.routes.some((r) => r.kind === 'shop')).toBe(true);
    expect(w.routes.some((r) => r.kind === 'alley')).toBe(true);
    expect(stage.tunnels.length).toBeGreaterThan(0);
    expect(stage.bridges.length).toBeGreaterThan(0);
    expect(w.pickups.length).toBeGreaterThan(0);
    const ys = Array.from({ length: 300 }, (_, i) => w.track.heightAt((i / 300) * w.track.length));
    expect(Math.max(...ys)).toBeGreaterThan(5);
  });

  it('shortcuts are actually shorter and stay clear of the main road between their mouths', () => {
    for (const r of w.routes) {
      expect(r.track.length).toBeLessThan(r.toS - r.fromS);
      expect(r.entry.to).toBeGreaterThan(r.entry.from);
      for (let s = 40; s < r.track.length - 40; s += 4) {
        const p = r.track.sample(s);
        const q = w.track.project(p.x, p.z);
        expect(Math.abs(q.d)).toBeGreaterThan(stage.roadHalfWidth + SIDEWALK + ROUTE_HALF_WIDTH);
      }
    }
  });

  it('shops have a front and a back window at each end', () => {
    for (const r of w.routes.filter((x) => x.kind === 'shop')) {
      expect(r.panes).toHaveLength(4);
      const s = r.panes.map((p) => p.s);
      expect([...s].sort((a, b) => a - b)).toEqual(s);
      expect(r.shops).toHaveLength(2);
    }
  });

  it('bridges are raised above the ground and tunnels stay at street level', () => {
    for (const b of stage.bridges) {
      const mid = ((b.from + b.to) / 2) * w.track.length;
      expect(w.track.heightAt(mid)).toBeGreaterThan(6);
    }
    for (const t of stage.tunnels) {
      for (let f = t.from; f <= t.to; f += 0.005) expect(w.track.heightAt(f * w.track.length)).toBeLessThan(0.5);
    }
  });

  it('pickups lie on their road', () => {
    for (const p of w.pickups) {
      const hw = p.route < 0 ? stage.roadHalfWidth : ROUTE_HALF_WIDTH;
      expect(Math.abs(p.d)).toBeLessThan(hw - BIKE.wallMargin);
      expect(p.s).toBeGreaterThan(0);
      expect(p.s).toBeLessThan(w.trackOf(p.route).length);
    }
  });
});

describe('shortcuts', () => {
  it('the wall opens at a shortcut mouth and the rider can ride in and out again', () => {
    const w = newWorld();
    const r = w.routes[0]!;
    const events = enterRoute(w, 0);
    expect(w.bike.route).toBe(0);
    expect(events).toContainEqual({ type: 'shortcut', route: 0 });
    expect(w.bike.crashTimer).toBe(0);
    let exit: { s: number; d: number; crashes: number } | null = null;
    run(w, 40, (x) => {
      if (!exit && x.bike.route < 0) exit = { s: x.bike.s, d: x.bike.d, crashes: x.bike.crashes };
      return exit ? controls() : centre(x);
    });
    expect(w.bike.route).toBe(-1);
    expect(exit!.crashes).toBe(0);
    expect(exit!.s).toBeGreaterThan(r.toS - 30);
    expect(exit!.s).toBeLessThan(r.toS + 5);
    expect(Math.abs(exit!.d)).toBeLessThan(stage.roadHalfWidth);
  });

  it('keeps the wall closed elsewhere', () => {
    const w = newWorld();
    w.bike.s = 200;
    w.bike.d = stage.roadHalfWidth - 1;
    w.bike.speed = 15;
    w.bike.yaw = 0.3;
    run(w, 1, controls({ throttle: 1, steer: 1 }));
    expect(w.bike.route).toBe(-1);
    expect(Math.abs(w.bike.d)).toBeLessThanOrEqual(stage.roadHalfWidth - BIKE.wallMargin);
  });

  it('race progress keeps advancing inside a shortcut', () => {
    const w = newWorld();
    enterRoute(w, 0);
    const before = w.mainS;
    run(w, 3, centre);
    expect(w.mainS).toBeGreaterThan(before + 20);
    expect(w.progress).toBeGreaterThan(0);
  });

  it('riding through a shop smashes its windows', () => {
    const w = newWorld();
    const i = w.routes.findIndex((r) => r.kind === 'shop');
    enterRoute(w, i);
    expect(w.bike.route).toBe(i);
    let crashesAtExit = -1;
    const events = run(w, 30, (x) => {
      if (crashesAtExit < 0 && x.bike.route < 0) crashesAtExit = x.bike.crashes;
      return crashesAtExit >= 0 ? controls() : centre(x);
    });
    const glass = events.filter((e) => e.type === 'glass');
    expect(glass).toHaveLength(4);
    expect(w.routes[i]!.panes.every((p) => p.broken)).toBe(true);
    expect(crashesAtExit).toBe(0);
  });

  it('breaking a window costs some speed', () => {
    const w = newWorld();
    const i = w.routes.findIndex((r) => r.kind === 'shop');
    const r = w.routes[i]!;
    w.bike.route = i;
    w.bike.s = r.panes[0]!.s - 0.3;
    w.bike.d = 0;
    w.bike.speed = 20;
    const events = w.step(controls(), FIXED_DT);
    expect(events.some((e) => e.type === 'glass')).toBe(true);
    expect(w.bike.speed).toBeLessThan(18);
  });
});

describe('explosive bonus', () => {
  const bus = (s: number, d: number) => ({
    id: 77,
    kind: 'bus' as const,
    s,
    d,
    dir: -1 as const,
    speed: 0,
    cruiseSpeed: 0,
    length: 11,
    width: 2.6,
    height: 3.2,
    honkCooldown: 99,
    variant: 0,
  });

  it('is collected by riding over the box, and comes back later', () => {
    const w = newWorld();
    const p = w.pickups.find((x) => x.route === -1)!;
    w.bike.s = p.s - 3;
    w.bike.d = p.d;
    w.bike.speed = 10;
    const events = run(w, 0.5, controls({ throttle: 1 }));
    expect(events).toContainEqual({ type: 'pickup', kind: 'explosive' });
    expect(w.bike.explosive).toBeGreaterThan(BIKE.explosiveDuration - 1);
    expect(p.respawn).toBeGreaterThan(0);
    run(w, 30, controls());
    expect(p.respawn).toBe(0);
  });

  it('blows up vehicles instead of knocking the rider down, for a limited time', () => {
    const w = newWorld();
    w.bike.s = 60;
    w.bike.d = 3;
    w.bike.speed = 25;
    w.bike.explosive = BIKE.explosiveDuration;
    w.traffic.vehicles.push(bus(75, 3));
    const events = run(w, 1, controls({ throttle: 1 }));
    expect(events.some((e) => e.type === 'explode' && e.vehicleId === 77)).toBe(true);
    expect(events.some((e) => e.type === 'crash')).toBe(false);
    expect(w.traffic.vehicles.some((v) => v.id === 77)).toBe(false);
    expect(w.race.bonusPoints).toBe(EXPLODE_POINTS);

    run(w, BIKE.explosiveDuration, controls());
    expect(w.bike.explosive).toBe(0);
    w.traffic.vehicles.length = 0;
    w.traffic.vehicles.push(bus(w.bike.s + 12, w.bike.d));
    w.bike.speed = 25;
    const later = run(w, 1, controls({ throttle: 1 }));
    expect(later).toContainEqual({ type: 'crash', cause: 'vehicle' });
  });
});

describe('hills', () => {
  const crestS = (w: World): number => 0.053 * w.track.length;

  it('launches the bike over a sharp crest at speed', () => {
    const w = newWorld();
    w.bike.s = crestS(w) - 20;
    w.bike.d = 3;
    w.bike.speed = 34;
    const events = run(w, 1.2, controls({ throttle: 1 }));
    expect(events.some((e) => e.type === 'jump')).toBe(true);
    expect(events.some((e) => e.type === 'land')).toBe(true);
    expect(w.bike.crashes).toBe(0);
  });

  it('stays on the ground over the same crest when slow', () => {
    const w = newWorld();
    w.bike.s = crestS(w) - 20;
    w.bike.d = 3;
    w.bike.speed = 12;
    const events = run(w, 2, controls({ throttle: 0.3 }));
    expect(events.some((e) => e.type === 'jump')).toBe(false);
  });

  it('climbing slows the bike down more than the flat', () => {
    const climb = newWorld();
    const bridge = stage.bridges[0]!;
    climb.bike.s = (bridge.from - 0.01) * climb.track.length;
    climb.bike.speed = 20;
    const flat = newWorld();
    flat.bike.s = 180;
    flat.bike.speed = 20;
    run(climb, 1.5, controls());
    run(flat, 1.5, controls());
    expect(climb.bike.speed).toBeLessThan(flat.bike.speed - 1);
  });
});

describe('river under the bridge', () => {
  it('only crosses the main road on the bridge span and never touches a shortcut', () => {
    const w = newWorld();
    const L = w.track.length;
    for (const b of stage.bridges) {
      const river = riverOf(w.track, b);
      for (let s = 0; s < L; s += 2) {
        for (const d of [-stage.roadHalfWidth - SIDEWALK, 0, stage.roadHalfWidth + SIDEWALK]) {
          const p = w.track.toWorld(s, d);
          if (inRiver(river, p.x, p.z)) {
            expect(s).toBeGreaterThan(b.from * L);
            expect(s).toBeLessThan(b.to * L);
            expect(w.track.sample(s).y).toBeGreaterThan(4);
          }
        }
      }
      for (const r of w.routes) {
        for (let s = 0; s < r.track.length; s += 2) {
          for (const d of [-ROUTE_HALF_WIDTH, 0, ROUTE_HALF_WIDTH]) {
            const p = r.track.toWorld(s, d);
            expect(inRiver(river, p.x, p.z)).toBe(false);
          }
        }
      }
    }
  });
});

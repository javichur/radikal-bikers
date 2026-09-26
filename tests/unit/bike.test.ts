import { describe, expect, it } from 'vitest';
import { CHARACTERS } from '../../src/content/characters';
import { FIXED_DT } from '../../src/core/loop';
import {
  BIKE,
  createBike,
  crashBike,
  effectiveTopSpeed,
  launchBike,
  stepBike,
  type BikeState,
} from '../../src/sim/bike';
import type { SimEvent } from '../../src/sim/events';
import { controls } from './helpers';

const stats = CHARACTERS[0]!.stats;
const env = { curvature: 0, roadHalfWidth: 12 };

const sim = (b: BikeState, seconds: number, c = controls(), e = env): SimEvent[] => {
  const events: SimEvent[] = [];
  for (let i = 0; i < Math.round(seconds / FIXED_DT); i++) stepBike(b, c, stats, e, FIXED_DT, events);
  return events;
};

describe('bike physics', () => {
  it('accelerates towards but never beyond top speed', () => {
    const b = createBike(0, 0);
    sim(b, 2, controls({ throttle: 1 }));
    const early = b.speed;
    expect(early).toBeGreaterThan(10);
    sim(b, 20, controls({ throttle: 1 }));
    expect(b.speed).toBeGreaterThan(stats.topSpeed * 0.95);
    expect(b.speed).toBeLessThanOrEqual(stats.topSpeed + 1e-9);
    expect(b.s).toBeGreaterThan(400);
  });

  it('lighter, quicker rider accelerates faster; heavier one has higher top speed', () => {
    const [rocco, luna] = CHARACTERS;
    const a = createBike(0, 0);
    const b = createBike(0, 0);
    const ev: SimEvent[] = [];
    for (let i = 0; i < 90; i++) {
      stepBike(a, controls({ throttle: 1 }), rocco!.stats, env, FIXED_DT, ev);
      stepBike(b, controls({ throttle: 1 }), luna!.stats, env, FIXED_DT, ev);
    }
    expect(b.speed).toBeGreaterThan(a.speed);
    expect(rocco!.stats.topSpeed).toBeGreaterThan(luna!.stats.topSpeed);
  });

  it('brakes hard and then reverses slowly', () => {
    const b = createBike(0, 0);
    b.speed = 30;
    sim(b, 1, controls({ brake: 1 }));
    expect(b.speed).toBeLessThan(10);
    sim(b, 3, controls({ brake: 1 }));
    expect(b.speed).toBeLessThan(0);
    expect(b.speed).toBeGreaterThanOrEqual(BIKE.reverseSpeed);
  });

  it('coasts down without throttle', () => {
    const b = createBike(0, 0);
    b.speed = 20;
    sim(b, 2);
    expect(b.speed).toBeLessThan(20);
    expect(b.speed).toBeGreaterThan(10);
  });

  it('steers right with positive input and moves to the right', () => {
    const b = createBike(0, 0);
    b.speed = 20;
    sim(b, 0.5, controls({ throttle: 1, steer: 1 }));
    expect(b.yaw).toBeGreaterThan(0);
    expect(b.d).toBeGreaterThan(0);
    expect(b.lean).toBeGreaterThan(0);
  });

  it('cannot turn while standing still', () => {
    const b = createBike(0, 0);
    sim(b, 1, controls({ steer: 1 }));
    expect(b.yaw).toBe(0);
  });

  it('drifts to the outside of a bend when not steering', () => {
    const b = createBike(0, 0);
    b.speed = 25;
    sim(b, 1, controls({ throttle: 1 }), { curvature: 1 / 50, roadHalfWidth: 12 });
    // Left-hand bend pushes the bike to the right.
    expect(b.d).toBeGreaterThan(0.5);
  });

  it('wheelie boosts top speed, reduces steering and times out', () => {
    const b = createBike(0, 0);
    b.speed = stats.topSpeed;
    const events = sim(b, 1, controls({ throttle: 1, wheelie: true }));
    expect(events.some((e) => e.type === 'wheelie')).toBe(true);
    expect(b.wheelie).toBe(1);
    expect(effectiveTopSpeed(b, stats)).toBeCloseTo(stats.topSpeed * BIKE.wheelieBoost);
    expect(b.speed).toBeGreaterThan(stats.topSpeed);
    sim(b, BIKE.wheelieMaxTime - 0.5, controls({ throttle: 1, wheelie: true }));
    expect(b.wheelieCooldown).toBeGreaterThan(0);
  });

  it('needs some speed to wheelie', () => {
    const b = createBike(0, 0);
    sim(b, 0.3, controls({ wheelie: true }));
    expect(b.wheelie).toBe(0);
  });

  it('scrapes along walls at shallow angles', () => {
    const b = createBike(0, 11);
    b.speed = 20;
    b.yaw = 0.2;
    const events = sim(b, 0.5, controls({ throttle: 1 }));
    expect(events.some((e) => e.type === 'scrape')).toBe(true);
    expect(b.crashTimer).toBe(0);
    expect(b.d).toBeLessThanOrEqual(12 - BIKE.wallMargin);
  });

  it('crashes into walls head-on', () => {
    const b = createBike(0, 10);
    b.speed = 30;
    b.yaw = 1;
    const events = sim(b, 0.3);
    expect(events).toContainEqual({ type: 'crash', cause: 'wall' });
    expect(b.crashes).toBe(1);
  });

  it('recovers after a crash with temporary invulnerability', () => {
    const b = createBike(0, 0);
    b.speed = 20;
    const events: SimEvent[] = [];
    crashBike(b, 'vehicle', events);
    crashBike(b, 'vehicle', events); // ignored while down
    expect(b.crashes).toBe(1);
    const after = sim(b, BIKE.crashDuration + 0.1, controls({ throttle: 1 }));
    expect(after.some((e) => e.type === 'respawn')).toBe(true);
    expect(b.crashTimer).toBe(0);
    expect(b.invulnerable).toBeGreaterThan(0);
    expect(b.yaw).toBe(0);
  });

  it('jumps off ramps and lands', () => {
    const b = createBike(0, 0);
    b.speed = 30;
    const events: SimEvent[] = [];
    launchBike(b, events);
    expect(b.airborne).toBe(true);
    sim(b, 0.3, controls({ throttle: 1 }));
    expect(b.height).toBeGreaterThan(1);
    const land = sim(b, 2, controls({ throttle: 1 }));
    expect(land.some((e) => e.type === 'land')).toBe(true);
    expect(b.airborne).toBe(false);
    expect(b.height).toBe(0);
  });

  it('crashes when landing sideways', () => {
    const b = createBike(0, 0);
    b.speed = 30;
    launchBike(b, []);
    b.yaw = 1.0;
    const events = sim(b, 3, controls(), { curvature: 0, roadHalfWidth: 200 });
    expect(events).toContainEqual({ type: 'crash', cause: 'landing' });
  });

  it('does not launch when slow', () => {
    const b = createBike(0, 0);
    b.speed = 2;
    launchBike(b, []);
    expect(b.airborne).toBe(false);
  });
});

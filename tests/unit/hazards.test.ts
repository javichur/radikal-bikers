import { describe, expect, it } from 'vitest';
import { CHARACTERS } from '../../src/content/characters';
import { OBSTACLES } from '../../src/content/obstacles';
import { getStage } from '../../src/content/stages';
import { VEHICLES } from '../../src/content/vehicles';
import {
  BARRIER_OFFSET,
  CROSSING_CLOSED,
  CROSSING_WARN,
  crossingState,
  TRAIN_APPROACH,
  TRAIN_LENGTH,
  trainOnRoad,
} from '../../src/sim/crossing';
import type { SimEvent } from '../../src/sim/events';
import { CROSSING_STOP_GAP, type Vehicle } from '../../src/sim/traffic';
import { World } from '../../src/sim/world';
import { controls, run } from './helpers';

const world = (id: string): World => new World(getStage(id), CHARACTERS[0]!);

const tram = (s: number, d: number): Vehicle => {
  const def = VEHICLES.tram;
  return {
    id: 999,
    kind: 'tram',
    s,
    d,
    dir: 1,
    speed: 0,
    cruiseSpeed: 0,
    length: def.length,
    width: def.width,
    height: def.height,
    honkCooldown: 99,
    variant: 0,
  };
};

/** Moves the simulation clock to the first moment (from now) when `test` holds for crossing 0. */
const waitFor = (w: World, test: (st: ReturnType<World['crossingAt']>) => boolean): void => {
  for (let i = 0; i < 100_000 && !test(w.crossingAt(0)); i++) w.time += 0.01;
};

describe('level crossing timetable', () => {
  it('lowers the barriers, sends the train across and lifts them again, every period', () => {
    const period = 40;
    expect(crossingState(period, 0, 0.001).closed).toBe(true);
    expect(crossingState(period, 0, 0.001).trainHead).toBeNull();
    expect(crossingState(period, 0, CROSSING_WARN + 0.1).trainHead).toBeCloseTo(-TRAIN_APPROACH + 3, 0);
    expect(crossingState(period, 0, CROSSING_CLOSED + 2).closed).toBe(false);
    expect(crossingState(period, 0, CROSSING_CLOSED + 2).arm).toBe(0);
    expect(crossingState(period, 0, 0.5).arm).toBeCloseTo(0.5, 5);
    expect(crossingState(period, 0, 7)).toEqual(crossingState(period, 0, 7 + period));
    expect(crossingState(period, 10, 7)).toEqual(crossingState(period, 0, 17));
  });

  it('only has the train on the road while the barriers are down, and after they have been down a while', () => {
    let seen = false;
    for (let t = 0; t < 80; t += 0.05) {
      const st = crossingState(40, 5, t);
      if (trainOnRoad(st, 9)) {
        seen = true;
        expect(st.closed).toBe(true);
        expect(st.arm).toBe(1);
      }
    }
    expect(seen).toBe(true);
    // The whole train clears the road before the barriers go up.
    const last = crossingState(40, 0, CROSSING_CLOSED - 0.01);
    expect(last.trainHead! - TRAIN_LENGTH).toBeGreaterThan(9);
  });
});

describe('Zona Industrial level crossing', () => {
  it('is on a timetable shorter than the period, so it opens between trains', () => {
    for (const c of getStage('industrial').crossings!) expect(c.period).toBeGreaterThan(CROSSING_CLOSED + 10);
  });

  it('rings the bells when the barriers come down near the rider', () => {
    const w = world('industrial');
    const c = w.crossings[0]!;
    w.bike.s = c.s - 150;
    waitFor(w, (st) => !st.closed);
    waitFor(w, (st) => st.closed);
    w.time -= 0.05;
    const events = run(w, 0.2, controls());
    expect(events).toContainEqual({ type: 'crossingBell', index: 0 });
  });

  it('the train knocks down a rider on the rails', () => {
    const w = world('industrial');
    const c = w.crossings[0]!;
    w.traffic.vehicles.length = 0;
    waitFor(w, (st) => trainOnRoad(st, w.stage.roadHalfWidth));
    w.bike.s = c.s;
    w.bike.d = 0;
    w.bike.speed = 0;
    const events = run(w, 0.1, controls());
    expect(events).toContainEqual({ type: 'crash', cause: 'obstacle' });
  });

  it('lowered barriers stop a rider on the ground, but can be jumped off the ramp', () => {
    const blocked = world('industrial');
    const c = blocked.crossings[0]!;
    blocked.traffic.vehicles.length = 0;
    waitFor(blocked, (st) => st.arm === 1 && st.trainHead !== null && st.trainHead < -60);
    blocked.bike.s = c.s - BARRIER_OFFSET - 3;
    blocked.bike.d = 5;
    blocked.bike.speed = 20;
    const hit = run(blocked, 0.5, controls({ throttle: 1 }));
    expect(hit).toContainEqual({ type: 'crash', cause: 'obstacle' });
    // Back on your feet on the near side of the barriers, never on the rails.
    const after = run(blocked, 4, controls());
    expect(after.some((e) => e.type === 'respawn')).toBe(true);
    expect(blocked.bike.s).toBeLessThan(c.s - BARRIER_OFFSET);

    // Barriers down but no train yet: fly over them off the ramp.
    const jumper = world('industrial');
    jumper.traffic.vehicles.length = 0;
    waitFor(jumper, (st) => st.closed && st.arm === 1);
    const ramp = jumper.ramps.find((r) => r.s < c.s && r.s > c.s - 20)!;
    jumper.bike.s = ramp.s - 30;
    jumper.bike.d = 3;
    jumper.bike.speed = 30;
    const events = run(jumper, 1.4, controls({ throttle: 1 }));
    expect(events.some((e) => e.type === 'jump')).toBe(true);
    expect(events.some((e) => e.type === 'crash')).toBe(false);
    expect(jumper.bike.s).toBeGreaterThan(c.s + BARRIER_OFFSET);
  });

  it('traffic waits before the closed crossing', () => {
    const w = world('industrial');
    const c = w.crossings[0]!;
    waitFor(w, (st) => st.closed && st.trainHead === null);
    w.traffic.vehicles.length = 0;
    w.traffic.vehicles.push({ ...tram(c.s - 60, 3), kind: 'car', length: 4.2, speed: 12, cruiseSpeed: 12 });
    w.bike.s = c.s - 120;
    w.bike.d = -9;
    run(w, 12, controls(), false);
    const car = w.traffic.vehicles.find((v) => v.id === 999)!;
    expect(car.speed).toBeLessThan(1);
    expect(car.s).toBeLessThan(c.s - CROSSING_STOP_GAP + 1);
    expect(car.s).toBeGreaterThan(c.s - CROSSING_STOP_GAP - 12);
  });
});

describe('Centro Histórico hazards', () => {
  it('cones are knocked over at a speed cost, and stay down', () => {
    const w = world('oldtown');
    const i = w.obstacles.findIndex((o) => o.kind === 'cones');
    const o = w.obstacles[i]!;
    w.traffic.vehicles.length = 0;
    w.bike.s = o.s - 10;
    w.bike.d = o.d;
    w.bike.speed = 20;
    const events: SimEvent[] = run(w, 0.8, controls({ throttle: 1 }));
    expect(events).toContainEqual({ type: 'knock', index: i });
    expect(events.some((e) => e.type === 'crash')).toBe(false);
    expect(o.knocked).toBe(true);
  });

  it('crashing into the fountain or a works fence knocks the rider down', () => {
    for (const kind of ['fountain', 'barrier'] as const) {
      const w = world('oldtown');
      const o = w.obstacles.find((x) => x.kind === kind)!;
      w.traffic.vehicles.length = 0;
      w.bike.s = o.s - OBSTACLES[kind].halfLength - 6;
      w.bike.d = o.d;
      w.bike.speed = 20;
      const events = run(w, 0.6, controls({ throttle: 1 }));
      expect(events).toContainEqual({ type: 'crash', cause: 'obstacle' });
      expect(o.knocked).toBe(false);
    }
  });

  it('the explosive bonus smashes works fences, but not the fountain', () => {
    const w = world('oldtown');
    const fence = w.obstacles.find((x) => x.kind === 'barrier')!;
    w.traffic.vehicles.length = 0;
    w.bike.explosive = 5;
    w.bike.s = fence.s - 8;
    w.bike.d = fence.d;
    w.bike.speed = 20;
    run(w, 0.8, controls({ throttle: 1 }));
    expect(fence.knocked).toBe(true);

    const f = world('oldtown');
    const fountain = f.obstacles.find((x) => x.kind === 'fountain')!;
    f.traffic.vehicles.length = 0;
    f.bike.explosive = 5;
    f.bike.s = fountain.s - 8;
    f.bike.d = fountain.d;
    f.bike.speed = 20;
    const events = run(f, 0.6, controls({ throttle: 1 }));
    expect(fountain.knocked).toBe(false);
    expect(events).toContainEqual({ type: 'crash', cause: 'obstacle' });
  });

  it('trams cannot be blown up by the explosive bonus', () => {
    const w = world('oldtown');
    w.traffic.vehicles.length = 0;
    w.bike.s = 300;
    w.bike.d = 3.5;
    w.bike.speed = 20;
    w.bike.explosive = 5;
    w.traffic.vehicles.push(tram(318, 3.5));
    const events = run(w, 1, controls({ throttle: 1 }));
    expect(events.some((e) => e.type === 'explode')).toBe(false);
    expect(events).toContainEqual({ type: 'crash', cause: 'vehicle' });
    expect(w.traffic.vehicles.some((v) => v.kind === 'tram')).toBe(true);
  });

  it('spawns trams, motocarri and taxis in the old town, and none of them on other stages', () => {
    const kinds = (id: string): Set<string> => {
      const w = world(id);
      const seen = new Set<string>();
      run(w, 60, (x) => {
        for (const v of x.traffic.vehicles) seen.add(v.kind);
        return controls({ throttle: 0.6 });
      });
      return seen;
    };
    const old = kinds('oldtown');
    expect(old.has('tram')).toBe(true);
    expect(old.has('motocarro')).toBe(true);
    expect(old.has('bus')).toBe(false);
    expect(kinds('harbor').has('tram')).toBe(false);
  });
});

describe('Carretera de la Colina', () => {
  it('oncoming traffic drives faster than on the other stages', () => {
    const ratios = (id: string): number[] => {
      const w = world(id);
      const seen = new Map<number, number>();
      run(w, 40, (x) => {
        for (const v of x.traffic.vehicles) {
          if (v.dir === -1) seen.set(v.id, v.cruiseSpeed / VEHICLES[v.kind].maxSpeed);
        }
        return controls({ throttle: 0.6 });
      });
      return [...seen.values()];
    };
    const hills = ratios('hills');
    expect(hills.length).toBeGreaterThan(3);
    expect(Math.max(...hills)).toBeGreaterThan(1.1);
    expect(Math.max(...ratios('harbor'))).toBeLessThanOrEqual(1);
  });

  it('crests throw the bike into the air without a ramp', () => {
    const w = world('hills');
    w.traffic.vehicles.length = 0;
    w.bike.s = 150;
    w.bike.d = 4;
    w.bike.speed = 34;
    let maxHeight = 0;
    const events = run(w, 6, (x) => {
      maxHeight = Math.max(maxHeight, x.bike.height);
      return controls({ throttle: 1 });
    });
    expect(events.some((e) => e.type === 'jump')).toBe(true);
    expect(maxHeight).toBeGreaterThan(0.5);
    // No flickering take-off/landing on the crest.
    expect(events.filter((e) => e.type === 'jump').length).toBeLessThan(8);
  });
});

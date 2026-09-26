import { describe, expect, it } from 'vitest';
import { CHARACTERS } from '../../src/content/characters';
import { getStage, STAGES } from '../../src/content/stages';
import { BIKE } from '../../src/sim/bike';
import { World } from '../../src/sim/world';
import { autopilot, controls, run } from './helpers';

const stage = getStage('harbor');
const newWorld = (c = 0): World => new World(stage, CHARACTERS[c]!);

describe('World', () => {
  it('holds the bike and the clock during the countdown', () => {
    const w = newWorld();
    run(w, 2, controls({ throttle: 1 }), false);
    expect(w.bike.speed).toBe(0);
    expect(w.race.timeLeft).toBe(stage.startTime);
  });

  it('is deterministic for the same seed and inputs', () => {
    const a = newWorld();
    const b = newWorld();
    run(a, 20, (w) => autopilot(w, 3));
    run(b, 20, (w) => autopilot(w, 3));
    expect(a.bike).toEqual(b.bike);
    expect(a.traffic.vehicles.map((v) => v.s)).toEqual(b.traffic.vehicles.map((v) => v.s));
  });

  it('launches off ramps', () => {
    const w = newWorld();
    const ramp = w.ramps[0]!;
    w.traffic.vehicles.length = 0;
    w.bike.s = ramp.s - 5;
    w.bike.d = ramp.d;
    w.bike.speed = 25;
    const events = run(w, 0.5, controls({ throttle: 1 }));
    expect(events.some((e) => e.type === 'jump')).toBe(true);
    expect(w.bike.height).toBeGreaterThan(0);
  });

  it('crashes into traffic at speed and respawns in a free lane', () => {
    const w = newWorld();
    w.traffic.vehicles.length = 0;
    w.traffic.vehicles.push({
      id: 99,
      kind: 'bus',
      s: 60,
      d: 3,
      dir: -1,
      speed: 0,
      cruiseSpeed: 0,
      length: 11,
      width: 2.6,
      height: 3.2,
      honkCooldown: 99,
      variant: 0,
    });
    w.bike.s = 45;
    w.bike.d = 3;
    w.bike.speed = 25;
    const events = run(w, 1, controls({ throttle: 1 }));
    expect(events).toContainEqual({ type: 'crash', cause: 'vehicle' });
    run(w, BIKE.crashDuration + 0.2, controls());
    expect(w.bike.crashTimer).toBe(0);
    const bus = w.traffic.vehicles.find((v) => v.id === 99);
    if (bus && Math.abs(bus.s - w.bike.s) < 25) expect(Math.abs(bus.d - w.bike.d)).toBeGreaterThan(2);
  });

  it('can jump over a vehicle', () => {
    const w = newWorld();
    w.traffic.vehicles.length = 0;
    w.traffic.vehicles.push({
      id: 5,
      kind: 'car',
      s: 100,
      d: 0,
      dir: 1,
      speed: 0,
      cruiseSpeed: 0,
      length: 4.4,
      width: 1.9,
      height: 1.5,
      honkCooldown: 99,
      variant: 0,
    });
    w.bike.s = 99;
    w.bike.d = 0;
    w.bike.speed = 30;
    w.bike.airborne = true;
    w.bike.height = 3;
    w.bike.vy = 4;
    const events = run(w, 0.3, controls({ throttle: 1 }));
    expect(events.some((e) => e.type === 'crash')).toBe(false);
  });

  it('continue restarts from the last checkpoint with a fresh clock', () => {
    const w = newWorld();
    w.bike.s = w.rules.checkpoints[0]!.s + 10;
    run(w, 0.1, controls());
    expect(w.race.nextCheckpoint).toBe(1);
    w.race.timeLeft = 0.01;
    const events = run(w, 0.2, controls());
    expect(events).toContainEqual({ type: 'timeUp' });
    w.continueFromCheckpoint();
    expect(w.race.timeUp).toBe(false);
    expect(w.race.timeLeft).toBe(stage.startTime);
    expect(w.bike.s).toBeCloseTo(w.rules.checkpoints[0]!.s + 1);
    expect(w.bike.invulnerable).toBeGreaterThan(0);
  });

  it.each(STAGES.flatMap((st) => CHARACTERS.map((c, i) => [st.id, c.id, i] as const)))(
    '%s can be completed by %s with a clean run, but not with a large margin',
    (stageId, _id, i) => {
      const st = getStage(stageId);
      const w = new World(st, CHARACTERS[i]!);
      const inner = st.lanes.forward[0]!;
      const outer = st.lanes.forward[st.lanes.forward.length - 1]!;
      run(w, 240, (world) => {
        if (world.race.finished || world.race.timeUp) return controls();
        // Change lane occasionally to use the whole road like a player would.
        return autopilot(world, world.bike.s % 600 < 300 ? inner : outer);
      });
      expect(w.race.timeUp).toBe(false);
      expect(w.race.finished).toBe(true);
      // Arcade balance: finishing should be tight (few seconds to spare).
      expect(w.race.timeLeft).toBeLessThan(35);
      expect(w.score).toBeGreaterThan(0);
    },
  );
});

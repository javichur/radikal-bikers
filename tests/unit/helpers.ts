import { FIXED_DT } from '../../src/core/loop';
import type { ControlState } from '../../src/input/types';
import { OBSTACLES } from '../../src/content/obstacles';
import { trainOnRoad } from '../../src/sim/crossing';
import type { SimEvent } from '../../src/sim/events';
import type { World } from '../../src/sim/world';

export const controls = (c: Partial<ControlState> = {}): ControlState => ({
  steer: 0,
  throttle: 0,
  brake: 0,
  wheelie: false,
  ...c,
});

/** Whether a train will be across the road at crossing `i` at any time in the next `seconds`. */
const trainComing = (world: World, i: number, seconds: number): boolean => {
  for (let t = 0; t <= seconds; t += 0.25) {
    if (trainOnRoad(world.crossingAt(i, world.time + t), world.stage.roadHalfWidth)) return true;
  }
  return false;
};

/**
 * Simple autopilot: full throttle, steers to hold a lateral target, dodges vehicles and obstacles ahead, waits for
 * trains at level crossings (and jumps the lowered barriers off the ramp otherwise).
 */
export const autopilot = (world: World, targetD: number): ControlState => {
  const b = world.bike;
  let d = targetD;
  const lanes = [...world.stage.lanes.forward, ...world.stage.lanes.oncoming];
  const blockers = [
    ...world.traffic.vehicles.map((v) => ({ s: v.s, d: v.d, halfWidth: 1 })),
    ...world.obstacles
      .filter((o) => !o.knocked)
      .map((o) => ({ s: o.s, d: o.d, halfWidth: OBSTACLES[o.kind].halfWidth })),
  ];
  const blocked = (lane: number, ahead = 45): boolean =>
    blockers.some((o) => Math.abs(o.d - lane) < o.halfWidth + 1 && o.s > b.s - 4 && o.s - b.s < ahead);
  if (blocked(d)) d = lanes.find((l) => !blocked(l)) ?? d;
  // Nowhere to go: slow down behind the traffic instead of ramming it.
  const boxedIn = blocked(d, 25) && b.speed > 12;
  const desiredYaw = Math.max(-0.4, Math.min(0.4, (d - b.d) * 0.15));
  const steer = Math.max(-1, Math.min(1, (desiredYaw - b.yaw) * 4));
  if (b.route < 0) {
    for (let i = 0; i < world.crossings.length; i++) {
      const dist = world.crossings[i]!.s - b.s;
      if (dist > 12 && dist < 110 && trainComing(world, i, dist / Math.max(b.speed, 8) + 1.5)) {
        return controls({ brake: b.speed > 0.5 ? 1 : 0, steer });
      }
    }
  }
  return boxedIn ? controls({ brake: 1, steer }) : controls({ throttle: 1, steer });
};

export const run = (
  world: World,
  seconds: number,
  input: ControlState | ((w: World) => ControlState),
  raceRunning = true,
): SimEvent[] => {
  const all: SimEvent[] = [];
  const steps = Math.round(seconds / FIXED_DT);
  for (let i = 0; i < steps; i++) {
    const c = typeof input === 'function' ? input(world) : input;
    all.push(...world.step(c, FIXED_DT, raceRunning));
  }
  return all;
};

import { FIXED_DT } from '../../src/core/loop';
import type { ControlState } from '../../src/input/types';
import type { SimEvent } from '../../src/sim/events';
import type { World } from '../../src/sim/world';

export const controls = (c: Partial<ControlState> = {}): ControlState => ({
  steer: 0,
  throttle: 0,
  brake: 0,
  wheelie: false,
  ...c,
});

/** Simple autopilot: full throttle, steers to hold a lateral target, dodges vehicles ahead. */
export const autopilot = (world: World, targetD: number): ControlState => {
  const b = world.bike;
  let d = targetD;
  const lanes = [...world.stage.lanes.forward, ...world.stage.lanes.oncoming];
  const blocked = (lane: number): boolean =>
    world.traffic.vehicles.some((v) => Math.abs(v.d - lane) < 2 && v.s > b.s - 4 && v.s - b.s < 45);
  if (blocked(d)) d = lanes.find((l) => !blocked(l)) ?? d;
  const desiredYaw = Math.max(-0.4, Math.min(0.4, (d - b.d) * 0.15));
  const steer = Math.max(-1, Math.min(1, (desiredYaw - b.yaw) * 4));
  return controls({ throttle: 1, steer });
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

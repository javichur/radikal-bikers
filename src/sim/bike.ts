import { approach, clamp } from '../core/math';
import type { CharacterStats } from '../content/characters';
import type { ControlState } from '../input/types';
import type { SimEvent } from './events';

export const BIKE = {
  length: 1.8,
  width: 0.8,
  brakeDecel: 24,
  rollingDecel: 1.6,
  overspeedDecel: 5,
  reverseSpeed: -4,
  wheelieMinSpeed: 6,
  wheelieRise: 3,
  wheelieFall: 4,
  wheelieBoost: 1.12,
  wheelieSteerFactor: 0.45,
  wheelieMaxTime: 3,
  wheelieCooldown: 1.5,
  maxYaw: 1.1,
  selfAlign: 0.25,
  wallMargin: 0.6,
  wallCrashLateralSpeed: 9,
  wallScrapeDecel: 12,
  gravity: 20,
  rampLaunchFactor: 0.32,
  landingCrashYaw: 0.75,
  crashDuration: 2.2,
  invulnerableDuration: 1.6,
  /** Fraction of gravity felt along the road gradient (arcade-friendly hills). */
  slopeFactor: 0.45,
  /** Seconds the explosive bonus lasts. */
  explosiveDuration: 8,
} as const;

export interface BikeState {
  s: number;
  d: number;
  /** Heading relative to the road tangent; positive points right. */
  yaw: number;
  /** m/s along the bike's heading (negative = reversing). */
  speed: number;
  /** Height above the road surface. */
  height: number;
  vy: number;
  airborne: boolean;
  /** 0 = both wheels down, 1 = full wheelie. */
  wheelie: number;
  wheelieTime: number;
  wheelieCooldown: number;
  /** Visual lean -1..1. */
  lean: number;
  /** > 0 while the rider is down after a crash. */
  crashTimer: number;
  invulnerable: number;
  crashes: number;
  /** -1 on the main road, otherwise the index of the shortcut route the bike is on. */
  route: number;
  /** > 0 while the explosive bonus is active: vehicles hit blow up instead of knocking the rider down. */
  explosive: number;
}

export const createBike = (s = 0, d = 3): BikeState => ({
  s,
  d,
  yaw: 0,
  speed: 0,
  height: 0,
  vy: 0,
  airborne: false,
  wheelie: 0,
  wheelieTime: 0,
  wheelieCooldown: 0,
  lean: 0,
  crashTimer: 0,
  invulnerable: 0,
  crashes: 0,
  route: -1,
  explosive: 0,
});

export const isCrashed = (b: BikeState): boolean => b.crashTimer > 0;

export const effectiveTopSpeed = (b: BikeState, stats: CharacterStats): number =>
  stats.topSpeed * (b.wheelie > 0.5 ? BIKE.wheelieBoost : 1);

export const crashBike = (
  b: BikeState,
  cause: 'wall' | 'vehicle' | 'landing' | 'obstacle',
  events: SimEvent[],
): void => {
  if (b.crashTimer > 0 || b.invulnerable > 0) return;
  b.crashTimer = BIKE.crashDuration;
  b.crashes++;
  b.wheelie = 0;
  b.wheelieTime = 0;
  events.push({ type: 'crash', cause });
};

export const launchBike = (b: BikeState, events: SimEvent[]): void => {
  if (b.airborne || b.speed < 5 || b.crashTimer > 0) return;
  b.airborne = true;
  b.vy = b.speed * BIKE.rampLaunchFactor + (b.wheelie > 0.5 ? 2 : 0);
  events.push({ type: 'jump' });
};

/** Touch-down after a jump; landing badly crossed knocks the rider down. */
export const landBike = (b: BikeState, events: SimEvent[]): void => {
  b.height = 0;
  b.vy = 0;
  b.airborne = false;
  events.push({ type: 'land' });
  if (Math.abs(b.yaw) > BIKE.landingCrashYaw) crashBike(b, 'landing', events);
};

export interface BikeEnv {
  /** Road curvature at the bike's position. */
  readonly curvature: number;
  readonly roadHalfWidth: number;
  /** Road gradient dy/ds at the bike's position (uphill slows the bike down). */
  readonly slope?: number;
  /** Side with no wall (a shortcut mouth): +1 right, -1 left, 0 none. */
  readonly openSide?: number;
  /** Vertical speed of the road surface under an airborne bike (the height is measured from the road). */
  readonly roadVy?: number;
}

/** Advances the bike one fixed step. Pure w.r.t. inputs; mutates `b`. */
export const stepBike = (
  b: BikeState,
  input: ControlState,
  stats: CharacterStats,
  env: BikeEnv,
  dt: number,
  events: SimEvent[],
): void => {
  b.invulnerable = Math.max(0, b.invulnerable - dt);
  b.explosive = Math.max(0, b.explosive - dt);
  b.wheelieCooldown = Math.max(0, b.wheelieCooldown - dt);

  if (b.crashTimer > 0) {
    b.crashTimer -= dt;
    b.speed = approach(b.speed, 0, 30 * dt);
    b.s += b.speed * Math.cos(b.yaw) * dt;
    b.height = Math.max(0, b.height + b.vy * dt);
    b.vy -= BIKE.gravity * dt;
    if (b.height <= 0) {
      b.height = 0;
      b.vy = 0;
      b.airborne = false;
    }
    b.lean = approach(b.lean, 0, 3 * dt);
    if (b.crashTimer <= 0) {
      b.crashTimer = 0;
      b.speed = 0;
      b.yaw = 0;
      b.height = 0;
      b.vy = 0;
      b.airborne = false;
      b.invulnerable = BIKE.invulnerableDuration;
      events.push({ type: 'respawn' });
    }
    return;
  }

  // --- Wheelie ---------------------------------------------------------
  const canWheelie = input.wheelie && !b.airborne && b.speed > BIKE.wheelieMinSpeed && b.wheelieCooldown <= 0;
  if (canWheelie) {
    if (b.wheelie === 0) events.push({ type: 'wheelie' });
    b.wheelie = approach(b.wheelie, 1, BIKE.wheelieRise * dt);
    b.wheelieTime += dt;
    if (b.wheelieTime > BIKE.wheelieMaxTime) {
      b.wheelieCooldown = BIKE.wheelieCooldown;
      b.wheelieTime = 0;
    }
  } else if (!b.airborne) {
    b.wheelie = approach(b.wheelie, 0, BIKE.wheelieFall * dt);
    if (b.wheelie === 0) b.wheelieTime = 0;
  }

  // --- Longitudinal ----------------------------------------------------
  const top = effectiveTopSpeed(b, stats);
  if (!b.airborne) {
    if (input.brake > 0 && b.speed > 0.2) {
      b.speed -= BIKE.brakeDecel * input.brake * dt;
      if (b.speed < 0) b.speed = 0;
    } else if (input.brake > 0 && input.throttle === 0) {
      b.speed = approach(b.speed, BIKE.reverseSpeed * input.brake, 4 * dt);
    } else if (input.throttle > 0 && b.speed < top) {
      const ratio = clamp(b.speed / top, 0, 1);
      b.speed += stats.acceleration * input.throttle * (1 - ratio * ratio * ratio) * dt;
      if (b.speed > top) b.speed = top;
    } else {
      b.speed = approach(b.speed, 0, BIKE.rollingDecel * dt);
    }
    if (b.speed > top) b.speed = approach(b.speed, top, BIKE.overspeedDecel * dt);
    const slope = env.slope ?? 0;
    if (slope !== 0 && b.speed > 0) b.speed = Math.max(0, b.speed - BIKE.gravity * BIKE.slopeFactor * slope * dt);
  }

  // --- Steering --------------------------------------------------------
  const speedAbs = Math.abs(b.speed);
  const speedFactor = clamp(speedAbs / 8, 0, 1) * (1 - 0.3 * clamp(speedAbs / stats.topSpeed, 0, 1));
  let steerFactor = b.wheelie > 0.5 ? BIKE.wheelieSteerFactor : 1;
  if (b.airborne) steerFactor *= 0.2;
  const steer = input.steer * Math.sign(b.speed || 1);
  b.yaw += steer * stats.handling * speedFactor * steerFactor * dt;
  if (input.steer === 0 && !b.airborne) b.yaw = approach(b.yaw, 0, BIKE.selfAlign * speedFactor * dt);

  // Road curvature rotates the road under the bike.
  const ds = b.speed * Math.cos(b.yaw) * dt;
  b.yaw += env.curvature * ds;
  b.yaw = clamp(b.yaw, -BIKE.maxYaw, BIKE.maxYaw);
  b.lean = approach(b.lean, input.steer * speedFactor, 4 * dt);

  // --- Integrate position ----------------------------------------------
  b.s += ds;
  b.d += b.speed * Math.sin(b.yaw) * dt;

  // --- Vertical ---------------------------------------------------------
  if (b.airborne) {
    b.vy -= BIKE.gravity * dt;
    b.height += (b.vy - (env.roadVy ?? 0)) * dt;
    if (b.height <= 0) landBike(b, events);
  }

  // --- Walls -------------------------------------------------------------
  const limit = env.roadHalfWidth - BIKE.wallMargin;
  if (Math.abs(b.d) > limit && Math.sign(b.d) !== (env.openSide ?? 0)) {
    const side = Math.sign(b.d);
    const lateral = b.speed * Math.sin(b.yaw) * side;
    b.d = side * limit;
    if (lateral > BIKE.wallCrashLateralSpeed && !b.airborne) {
      crashBike(b, 'wall', events);
    } else {
      b.speed = Math.max(0, b.speed - (BIKE.wallScrapeDecel / stats.weight) * dt);
      if (b.yaw * side > 0) b.yaw *= 0.5;
      events.push({ type: 'scrape' });
    }
  }
  if (b.s < 0) {
    b.s = 0;
    if (b.speed < 0) b.speed = 0;
  }
};

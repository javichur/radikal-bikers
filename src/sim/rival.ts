import type { CharacterDef, CharacterStats } from '../content/characters';
import type { StageDef } from '../content/stages';
import { clamp } from '../core/math';
import { BIKE, createBike, launchBike, stepBike, type BikeState } from './bike';
import type { SimEvent } from './events';
import type { Ramp } from './world';
import type { Track } from './track';
import { laneClosed, type WorkZone } from './roadworks';
import { overlaps, type Vehicle } from './traffic';

/** Rival lead (m) beyond which it eases off, and deficit beyond which it pushes harder (rubber band). */
const EASE_LEAD = 40;
const PUSH_DEFICIT = 120;
/** Top-speed factor in normal running, so a clean ride can beat it. */
const PACE = 0.95;
const LOOKAHEAD = 40;
/** Speed (m/s) while squeezing past a vehicle it could not avoid. */
const SQUEEZE_SPEED = 12;

/** A computer-driven rider that races the player on the main road (versus mode). */
export interface RivalState {
  readonly character: CharacterDef;
  bike: BikeState;
  targetD: number;
  finished: boolean;
  /** Race time when it reached the finish line. */
  finishTime: number;
  /** Whether the player was ahead on the previous step (overtake detection). */
  playerAhead: boolean;
}

export const createRival = (character: CharacterDef, stage: StageDef, s = 5): RivalState => {
  const lane = stage.lanes.forward[stage.lanes.forward.length - 1] ?? 0;
  return {
    character,
    bike: createBike(s, lane),
    targetD: lane,
    finished: false,
    finishTime: 0,
    playerAhead: false,
  };
};

export interface RivalEnv {
  readonly track: Track;
  readonly stage: StageDef;
  readonly ramps: readonly Ramp[];
  readonly vehicles: readonly Vehicle[];
  readonly zones: readonly WorkZone[];
  readonly finishS: number;
  readonly playerS: number;
  readonly elapsed: number;
}

const blocked = (env: RivalEnv, b: BikeState, lane: number): boolean =>
  laneClosed(env.zones, b.s + LOOKAHEAD / 2, lane, LOOKAHEAD / 2) ||
  env.vehicles.some(
    (v) => Math.abs(v.d - lane) < 2.2 && v.s > b.s - 3 && v.s - b.s < (v.dir < 0 ? LOOKAHEAD * 2 : LOOKAHEAD),
  );

/** Steers to a free lane at full throttle, easing off when far ahead of the player. */
const drive = (r: RivalState, env: RivalEnv): { steer: number; throttle: number } => {
  const b = r.bike;
  if (blocked(env, b, r.targetD)) {
    const lanes = [...env.stage.lanes.forward, ...env.stage.lanes.oncoming];
    const free = lanes.filter((l) => !blocked(env, b, l));
    if (free.length) r.targetD = free.reduce((a, l) => (Math.abs(l - b.d) < Math.abs(a - b.d) ? l : a));
  }
  const desiredYaw = clamp((r.targetD - b.d) * 0.15, -0.4, 0.4);
  const steer = clamp((desiredYaw - b.yaw) * 4, -1, 1);
  const lead = b.s - env.playerS;
  return { steer, throttle: lead > EASE_LEAD ? 0.55 : 1 };
};

export const stepRival = (r: RivalState, env: RivalEnv, running: boolean, dt: number, events: SimEvent[]): void => {
  const b = r.bike;
  const prevS = b.s;
  const own: SimEvent[] = [];
  const pace = env.playerS - b.s > PUSH_DEFICIT ? 1.1 : PACE;
  const stats: CharacterStats = { ...r.character.stats, topSpeed: r.character.stats.topSpeed * pace };
  const input =
    running && !r.finished
      ? { ...drive(r, env), brake: 0, wheelie: false }
      : { steer: 0, throttle: 0, brake: r.finished ? 1 : 0, wheelie: false };
  const p = env.track.sample(b.s);
  stepBike(
    b,
    input,
    stats,
    { curvature: p.curvature, roadHalfWidth: env.stage.roadHalfWidth, slope: p.slope },
    dt,
    own,
  );
  for (const ramp of env.ramps) {
    if (prevS < ramp.s && b.s >= ramp.s && Math.abs(b.d - ramp.d) < ramp.width / 2) launchBike(b, own);
  }
  // Traffic never knocks the rival down: it queues behind slower cars and squeezes past oncoming ones.
  const box = { s: b.s, d: b.d, halfLength: BIKE.length / 2, halfWidth: BIKE.width / 2 };
  for (const v of env.vehicles) {
    if (b.height > v.height) continue;
    if (!overlaps(box, { s: v.s, d: v.d, halfLength: v.length / 2, halfWidth: v.width / 2 })) continue;
    if (v.dir > 0 && v.s > b.s) {
      b.s = v.s - (v.length / 2 + BIKE.length / 2 + 0.05);
      b.speed = Math.min(b.speed, v.speed);
    } else {
      b.speed = Math.min(b.speed, SQUEEZE_SPEED);
    }
  }
  if (running && !r.finished && b.s >= env.finishS) {
    r.finished = true;
    r.finishTime = env.elapsed;
  }
  if (!running) return;
  const ahead = env.playerS > b.s;
  if (ahead !== r.playerAhead && Math.abs(env.playerS - b.s) > 1) {
    r.playerAhead = ahead;
    events.push({ type: 'rivalPassed', ahead });
  }
};

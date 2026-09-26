/** Best-run "ghost": the rider's pose sampled at a fixed rate, replayed as a translucent bike. */

export const GHOST_RATE = 15;
/** Values stored per frame: route, s, d, yaw, height, wheelie, lean. */
const STRIDE = 7;

export interface GhostData {
  readonly version: 1;
  /** Race time of the run. */
  readonly time: number;
  /** Race time at each checkpoint. */
  readonly splits: readonly number[];
  readonly frames: readonly number[];
}

export interface GhostPose {
  readonly route: number;
  readonly s: number;
  readonly d: number;
  readonly yaw: number;
  readonly height: number;
  readonly wheelie: number;
  readonly lean: number;
}

const r2 = (v: number): number => Math.round(v * 100) / 100;

export class GhostRecorder {
  private readonly frames: number[] = [];
  private readonly splits: number[] = [];
  private next = 0;

  /** Samples the pose whenever the race clock crosses the next frame time. */
  sample(elapsed: number, p: GhostPose): void {
    while (elapsed >= this.next) {
      this.frames.push(p.route, Math.round(p.s * 10) / 10, r2(p.d), r2(p.yaw), r2(p.height), r2(p.wheelie), r2(p.lean));
      this.next += 1 / GHOST_RATE;
    }
  }

  split(elapsed: number): void {
    this.splits.push(elapsed);
  }

  get splitTimes(): readonly number[] {
    return this.splits;
  }

  finish(time: number): GhostData {
    return { version: 1, time, splits: [...this.splits], frames: [...this.frames] };
  }
}

export const ghostLength = (g: GhostData): number => Math.floor(g.frames.length / STRIDE);

const frameAt = (g: GhostData, i: number): GhostPose => {
  const f = g.frames;
  const o = i * STRIDE;
  return {
    route: f[o]!,
    s: f[o + 1]!,
    d: f[o + 2]!,
    yaw: f[o + 3]!,
    height: f[o + 4]!,
    wheelie: f[o + 5]!,
    lean: f[o + 6]!,
  };
};

/** Interpolated pose at race time `t` (holds the last frame after the end); null for an empty ghost. */
export const ghostPose = (g: GhostData, t: number): GhostPose | null => {
  const n = ghostLength(g);
  if (n === 0) return null;
  const x = Math.max(0, t * GHOST_RATE);
  const i = Math.min(n - 1, Math.floor(x));
  const a = frameAt(g, i);
  if (i + 1 >= n) return a;
  const b = frameAt(g, i + 1);
  if (a.route !== b.route) return a;
  const k = x - i;
  const mix = (u: number, v: number): number => u + (v - u) * k;
  return {
    route: a.route,
    s: mix(a.s, b.s),
    d: mix(a.d, b.d),
    yaw: mix(a.yaw, b.yaw),
    height: mix(a.height, b.height),
    wheelie: mix(a.wheelie, b.wheelie),
    lean: mix(a.lean, b.lean),
  };
};

/** Validates data loaded from storage. */
export const isGhostData = (v: unknown): v is GhostData => {
  if (!v || typeof v !== 'object') return false;
  const g = v as Partial<GhostData>;
  return (
    g.version === 1 &&
    typeof g.time === 'number' &&
    Array.isArray(g.splits) &&
    g.splits.every((x) => typeof x === 'number') &&
    Array.isArray(g.frames) &&
    g.frames.length % STRIDE === 0 &&
    g.frames.every((x) => typeof x === 'number' && Number.isFinite(x))
  );
};

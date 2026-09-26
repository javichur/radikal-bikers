import type { ChallengeDef, GradeThresholds } from './challenges';
import type { PickupKind } from '../sim/events';
import type { ObstacleKind } from './obstacles';
import type { TrafficMix } from './vehicles';

export interface ShortcutDef {
  /** Course fractions where the shortcut leaves and rejoins the main road. */
  readonly from: number;
  readonly to: number;
  /** Side of the main road it branches off: +1 right, -1 left. */
  readonly side: 1 | -1;
  /**
   * Alleys are plain back streets; shops put a store (with breakable windows) at each end; dirt tracks are country
   * lanes between fields.
   */
  readonly kind: 'alley' | 'shop' | 'dirt';
}

/** Look of the surroundings: buildings, props, road surface and landmarks. */
export type SceneryStyle = 'city' | 'beach' | 'oldtown' | 'industrial' | 'hills';

export interface StageDef {
  readonly id: string;
  readonly nameKey: string;
  readonly descriptionKey: string;
  /** 1 (easiest) … 5 (hardest). Stages are listed in this order, as in the original arcade route choice. */
  readonly difficulty: number;
  readonly scenery: SceneryStyle;
  /** Road centreline control points: [x, z, elevation]. */
  readonly controlPoints: readonly (readonly [number, number, number])[];
  /** Road elevation keys (course fraction → metres) for hills, crests and bridges. Overrides the control points. */
  readonly profile?: readonly { readonly at: number; readonly y: number }[];
  /** Half of the drivable road width, metres. */
  readonly roadHalfWidth: number;
  /** Lateral offsets of the lane centres (positive = right). */
  readonly lanes: {
    readonly forward: readonly number[];
    readonly oncoming: readonly number[];
  };
  /** Seconds on the clock at the start. */
  readonly startTime: number;
  /** Checkpoints as fractions of the course length, with bonus seconds. */
  readonly checkpoints: readonly { readonly at: number; readonly bonus: number }[];
  /** Jump ramps as fractions of the course length. */
  readonly ramps: readonly { readonly at: number; readonly d: number; readonly width: number }[];
  /** Alternative routes that cut corners (no traffic, but narrow). */
  readonly shortcuts: readonly ShortcutDef[];
  /** Covered sections of the main road, as course fractions. */
  readonly tunnels: readonly { readonly from: number; readonly to: number }[];
  /** Raised sections over a river, as course fractions (the profile must lift the road there). */
  readonly bridges: readonly { readonly from: number; readonly to: number }[];
  /**
   * Bonus boxes. `route` is -1 for the main road or a shortcut index; `at` is a fraction of it.
   * `kind` defaults to the explosive bonus.
   */
  readonly pickups: readonly {
    readonly route: number;
    readonly at: number;
    readonly d: number;
    readonly kind?: PickupKind;
  }[];
  /** Fixed obstacles on the main road (`at` = course fraction, `d` = lateral offset of their centre). */
  readonly obstacles?: readonly { readonly at: number; readonly d: number; readonly kind: ObstacleKind }[];
  /** Level crossings: railway across the road at `at`, a train every `period` s (timetable shifted by `offset`). */
  readonly crossings?: readonly { readonly at: number; readonly period: number; readonly offset: number }[];
  /** Sea polygon (world XZ); the coast is kept clear of buildings. */
  readonly sea?: readonly (readonly [number, number])[];
  /** Target amount of traffic vehicles around the player. */
  readonly trafficDensity: number;
  /** Relative spawn probability per vehicle kind (default mix when omitted). */
  readonly trafficMix?: TrafficMix;
  /** Cruise speed multiplier for oncoming traffic. */
  readonly oncomingSpeedScale?: number;
  /** Candidate roadworks (a line of cones closing a lane); `roadworksPerRace` of them are picked at random. */
  readonly roadworks: readonly { readonly at: number; readonly d: number; readonly length: number }[];
  readonly roadworksPerRace: number;
  /** Id of the rival rider (versus); if the player picks that rider, another one races instead. */
  readonly rival: string | null;
  /** Score thresholds of the S/A/B grades. */
  readonly grades: GradeThresholds;
  /** Three challenges, one star each. */
  readonly challenges: readonly ChallengeDef[];
  /** Total stars needed to unlock the stage (0 = always available). */
  readonly unlockStars: number;
  readonly theme: {
    readonly sky: number;
    readonly fog: number;
    readonly ground: number;
    readonly road: number;
    readonly buildings: readonly number[];
    readonly night?: boolean;
  };
  readonly seed: number;
}

type P2 = readonly [number, number];
type P3 = readonly [number, number, number];

/**
 * Street-grid layout helper: turns a polyline into evenly spaced spline control points with every corner rounded to
 * an arc of the given radius (city blocks with tight turns instead of the smooth curves of a spline through the
 * vertices).
 */
export const roundCorners = (points: readonly P2[], radius: number): P3[] => {
  const SPACING = 20;
  const path: P2[] = [points[0]!];
  for (let i = 1; i < points.length - 1; i++) {
    const [px, pz] = points[i - 1]!;
    const [vx, vz] = points[i]!;
    const [nx, nz] = points[i + 1]!;
    const la = Math.hypot(px - vx, pz - vz);
    const lc = Math.hypot(nx - vx, nz - vz);
    if (la === 0 || lc === 0) {
      path.push(points[i]!);
      continue;
    }
    const ax = (px - vx) / la;
    const az = (pz - vz) / la;
    const cx = (nx - vx) / lc;
    const cz = (nz - vz) / lc;
    const theta = Math.acos(Math.max(-1, Math.min(1, ax * cx + az * cz)));
    const bl = Math.hypot(ax + cx, az + cz);
    if (bl < 1e-6 || theta < 1e-6) {
      path.push(points[i]!);
      continue;
    }
    const t = radius / Math.tan(theta / 2);
    const ox = vx + ((ax + cx) / bl) * (radius / Math.sin(theta / 2));
    const oz = vz + ((az + cz) / bl) * (radius / Math.sin(theta / 2));
    const a1 = Math.atan2(vz + az * t - oz, vx + ax * t - ox);
    let a2 = Math.atan2(vz + cz * t - oz, vx + cx * t - ox);
    if (a2 - a1 > Math.PI) a2 -= 2 * Math.PI;
    if (a2 - a1 < -Math.PI) a2 += 2 * Math.PI;
    const n = Math.max(2, Math.ceil((Math.abs(a2 - a1) * radius) / SPACING));
    for (let k = 0; k <= n; k++) {
      const a = a1 + ((a2 - a1) * k) / n;
      path.push([ox + Math.cos(a) * radius, oz + Math.sin(a) * radius]);
    }
  }
  path.push(points[points.length - 1]!);
  // Even spacing along the straights keeps the Catmull-Rom spline from overshooting.
  const out: P3[] = [];
  for (let i = 0; i < path.length - 1; i++) {
    const [x0, z0] = path[i]!;
    const [x1, z1] = path[i + 1]!;
    const n = Math.max(1, Math.round(Math.hypot(x1 - x0, z1 - z0) / SPACING));
    for (let k = 0; k < n; k++) out.push([x0 + ((x1 - x0) * k) / n, z0 + ((z1 - z0) * k) / n, 0]);
  }
  const last = path[path.length - 1]!;
  out.push([last[0], last[1], 0]);
  return out;
};

export const STAGES: readonly StageDef[] = [
  {
    id: 'beach',
    nameKey: 'stage.beach.name',
    descriptionKey: 'stage.beach.desc',
    difficulty: 1,
    scenery: 'beach',
    // Seafront avenue with a detour inland around the old town walls.
    controlPoints: roundCorners(
      [
        [0, -40],
        [0, 520],
        [-260, 640],
        [-440, 700],
        [-500, 900],
        [-440, 1120],
        [-240, 1200],
        [0, 1330],
        [0, 2000],
        [0, 2060],
      ],
      130,
    ),
    roadHalfWidth: 12,
    lanes: { forward: [3, 9], oncoming: [-3, -9] },
    startTime: 45,
    checkpoints: [
      { at: 0.25, bonus: 22 },
      { at: 0.5, bonus: 20 },
      { at: 0.75, bonus: 18 },
    ],
    ramps: [
      { at: 0.08, d: 0, width: 8 },
      { at: 0.13, d: -6, width: 8 },
      { at: 0.31, d: 6, width: 8 },
      { at: 0.43, d: -6, width: 8 },
      { at: 0.58, d: 6, width: 8 },
      { at: 0.84, d: 0, width: 10 },
      { at: 0.91, d: -6, width: 8 },
    ],
    shortcuts: [
      { from: 0.15, to: 0.27, side: 1, kind: 'shop' },
      { from: 0.35, to: 0.52, side: -1, kind: 'alley' },
      { from: 0.66, to: 0.79, side: 1, kind: 'alley' },
    ],
    tunnels: [],
    bridges: [],
    pickups: [
      { route: -1, at: 0.1, d: 6 },
      { route: -1, at: 0.6, d: -3 },
      { route: -1, at: 0.88, d: 3 },
      { route: 1, at: 0.5, d: 0 },
      { route: -1, at: 0.37, d: 3, kind: 'turbo' },
      { route: -1, at: 0.72, d: 9, kind: 'turbo' },
    ],
    sea: [
      [62, -3000],
      [4000, -3000],
      [4000, 6000],
      [62, 6000],
    ],
    trafficDensity: 12,
    roadworks: [],
    roadworksPerRace: 0,
    rival: 'luna',
    grades: { s: 65000, a: 50000, b: 35000 },
    challenges: [
      { kind: 'noCrash', target: 0 },
      { kind: 'shortcuts', target: 2 },
      { kind: 'wheelieStreak', target: 2 },
    ],
    unlockStars: 0,
    theme: {
      sky: 0x6fd3ff,
      fog: 0xc9f0ff,
      ground: 0xf2dfa7,
      road: 0x3b3f4a,
      buildings: [0xffe5b4, 0xffc09f, 0xfff1c1, 0xa0e7e5, 0xffadad, 0xfdffb6, 0xcaffbf, 0xffd6a5],
    },
    seed: 1999,
  },
  {
    id: 'harbor',
    nameKey: 'stage.harbor.name',
    descriptionKey: 'stage.harbor.desc',
    difficulty: 2,
    scenery: 'city',
    controlPoints: [
      [0, -40, 0],
      [0, 0, 0],
      [0, 220, 0],
      [40, 400, 2],
      [160, 540, 6],
      [340, 580, 8],
      [520, 540, 6],
      [640, 420, 2],
      [700, 240, 0],
      [820, 110, 0],
      [1000, 90, 3],
      [1160, 170, 8],
      [1240, 330, 10],
      [1220, 530, 6],
      [1120, 690, 2],
      [1140, 870, 0],
      [1260, 990, 0],
      [1460, 1010, 0],
      [1520, 1010, 0],
    ],
    roadHalfWidth: 12,
    lanes: { forward: [3, 9], oncoming: [-3, -9] },
    startTime: 40,
    checkpoints: [
      { at: 0.22, bonus: 30 },
      { at: 0.46, bonus: 28 },
      { at: 0.7, bonus: 25 },
    ],
    ramps: [
      { at: 0.12, d: 0, width: 8 },
      { at: 0.4, d: -6, width: 8 },
      { at: 0.63, d: 6, width: 8 },
      { at: 0.85, d: 0, width: 10 },
    ],
    profile: [
      { at: 0, y: 0 },
      { at: 0.045, y: 0 },
      { at: 0.053, y: 2.6 },
      { at: 0.061, y: 0.4 },
      { at: 0.069, y: 3 },
      { at: 0.077, y: 0 },
      { at: 0.29, y: 0 },
      { at: 0.31, y: 9 },
      { at: 0.37, y: 9 },
      { at: 0.39, y: 0 },
      { at: 0.72, y: 0 },
      { at: 0.728, y: 3.2 },
      { at: 0.736, y: 0.6 },
      { at: 0.744, y: 3.4 },
      { at: 0.752, y: 0.8 },
      { at: 0.76, y: 3 },
      { at: 0.768, y: 0 },
      { at: 1, y: 0 },
    ],
    shortcuts: [
      { from: 0.13, to: 0.29, side: -1, kind: 'alley' },
      { from: 0.415, to: 0.515, side: 1, kind: 'shop' },
      { from: 0.61, to: 0.71, side: 1, kind: 'alley' },
      { from: 0.785, to: 0.88, side: -1, kind: 'shop' },
    ],
    tunnels: [{ from: 0.53, to: 0.6 }],
    bridges: [{ from: 0.3, to: 0.38 }],
    pickups: [
      { route: -1, at: 0.09, d: 6 },
      { route: -1, at: 0.42, d: -6 },
      { route: -1, at: 0.61, d: 3 },
      { route: -1, at: 0.9, d: -3 },
      { route: 0, at: 0.5, d: 0 },
      { route: 2, at: 0.5, d: 0 },
      { route: -1, at: 0.27, d: 3, kind: 'turbo' },
      { route: -1, at: 0.74, d: 9, kind: 'turbo' },
    ],
    trafficDensity: 16,
    roadworks: [
      { at: 0.08, d: 9, length: 40 },
      { at: 0.18, d: -9, length: 50 },
      { at: 0.33, d: 3, length: 30 },
      { at: 0.5, d: -3, length: 45 },
      { at: 0.66, d: 9, length: 40 },
      { at: 0.8, d: -9, length: 50 },
      { at: 0.92, d: 3, length: 35 },
    ],
    roadworksPerRace: 2,
    rival: 'rocco',
    grades: { s: 75000, a: 60000, b: 45000 },
    challenges: [
      { kind: 'wheelieStreak', target: 2.5 },
      { kind: 'shortcuts', target: 2 },
      { kind: 'noCrash', target: 0 },
    ],
    unlockStars: 0,
    theme: {
      sky: 0x7ec8ff,
      fog: 0xbfe3ff,
      ground: 0x9ccf6a,
      road: 0x3b3f4a,
      buildings: [0xffb4a2, 0xffd6a5, 0xcaffbf, 0x9bf6ff, 0xa0c4ff, 0xbdb2ff, 0xffc6ff, 0xfdffb6],
    },
    seed: 1998,
  },
  {
    id: 'oldtown',
    nameKey: 'stage.oldtown.name',
    descriptionKey: 'stage.oldtown.desc',
    difficulty: 3,
    scenery: 'oldtown',
    // Narrow two-way streets zig-zagging between the blocks of the old town.
    controlPoints: roundCorners(
      [
        [0, -40],
        [0, 300],
        [-220, 300],
        [-220, 620],
        [60, 620],
        [60, 900],
        [-120, 900],
        [-120, 1180],
        [160, 1180],
        [160, 1460],
      ],
      55,
    ),
    profile: [
      { at: 0, y: 0 },
      { at: 0.55, y: 0 },
      { at: 0.555, y: 1.2 },
      { at: 0.56, y: 0.2 },
      { at: 0.565, y: 1.4 },
      { at: 0.57, y: 0.2 },
      { at: 0.575, y: 1.2 },
      { at: 0.58, y: 0 },
      { at: 1, y: 0 },
    ],
    roadHalfWidth: 7.5,
    lanes: { forward: [3.5], oncoming: [-3.5] },
    startTime: 40,
    checkpoints: [
      { at: 0.3, bonus: 26 },
      { at: 0.55, bonus: 24 },
      { at: 0.78, bonus: 20 },
    ],
    ramps: [
      { at: 0.44, d: 0, width: 6 },
      { at: 0.91, d: 3.5, width: 5 },
    ],
    shortcuts: [
      { from: 0.09, to: 0.2, side: 1, kind: 'shop' },
      { from: 0.3, to: 0.41, side: -1, kind: 'shop' },
      { from: 0.43, to: 0.63, side: 1, kind: 'alley' },
      { from: 0.7, to: 0.81, side: -1, kind: 'shop' },
      { from: 0.84, to: 0.94, side: 1, kind: 'shop' },
    ],
    // Porticoes: the street runs under the arches of the palazzi.
    tunnels: [
      { from: 0.245, to: 0.29 },
      { from: 0.95, to: 0.975 },
    ],
    bridges: [],
    pickups: [
      { route: -1, at: 0.19, d: -3.5 },
      { route: -1, at: 0.68, d: 3.5 },
      { route: 2, at: 0.5, d: 0 },
      { route: -1, at: 0.25, d: 3.5, kind: 'turbo' },
      { route: -1, at: 0.78, d: 3.5, kind: 'turbo' },
    ],
    obstacles: [
      { at: 0.06, d: 0, kind: 'fountain' },
      { at: 0.12, d: -6.3, kind: 'barrier' },
      { at: 0.35, d: 0, kind: 'cones' },
      { at: 0.53, d: 6.3, kind: 'barrier' },
      { at: 0.62, d: 0, kind: 'cones' },
      { at: 0.66, d: -6.3, kind: 'barrier' },
      { at: 0.86, d: 0, kind: 'cones' },
      { at: 0.9, d: -6.3, kind: 'barrier' },
    ],
    trafficDensity: 10,
    trafficMix: { car: 3, taxi: 2, van: 2, motocarro: 3, tram: 1 },
    roadworks: [],
    roadworksPerRace: 0,
    rival: 'nitro',
    grades: { s: 80000, a: 62000, b: 46000 },
    challenges: [
      { kind: 'shortcuts', target: 3 },
      { kind: 'noCrash', target: 0 },
      { kind: 'explode', target: 2 },
    ],
    unlockStars: 0,
    theme: {
      sky: 0x8fd3ff,
      fog: 0xf3e1c0,
      ground: 0xb8a07e,
      road: 0x6b5e55,
      buildings: [0xe9b872, 0xd98e5f, 0xf2cc8f, 0xc8553d, 0xe07a5f, 0xf4d6a0, 0xd4a373, 0xf1dca7],
    },
    seed: 1300,
  },
  {
    id: 'industrial',
    nameKey: 'stage.industrial.name',
    descriptionKey: 'stage.industrial.desc',
    difficulty: 4,
    scenery: 'industrial',
    controlPoints: roundCorners(
      [
        [0, -40],
        [0, 560],
        [320, 560],
        [320, 900],
        [-160, 900],
        [-160, 1260],
        [260, 1260],
        [260, 1640],
      ],
      75,
    ),
    roadHalfWidth: 12,
    lanes: { forward: [3, 9], oncoming: [-3, -9] },
    startTime: 40,
    checkpoints: [
      { at: 0.24, bonus: 26 },
      { at: 0.48, bonus: 24 },
      { at: 0.72, bonus: 20 },
    ],
    ramps: [
      // Right in front of the level crossing: the only way over the lowered barriers.
      { at: 0.1063, d: 0, width: 22 },
      { at: 0.2, d: 6, width: 8 },
      { at: 0.62, d: -6, width: 8 },
      { at: 0.8, d: 0, width: 10 },
    ],
    shortcuts: [
      { from: 0.15, to: 0.27, side: -1, kind: 'alley' },
      { from: 0.29, to: 0.47, side: 1, kind: 'shop' },
      { from: 0.55, to: 0.77, side: -1, kind: 'alley' },
      { from: 0.81, to: 0.92, side: 1, kind: 'shop' },
    ],
    // Underpass beneath the freight yard.
    tunnels: [{ from: 0.49, to: 0.535 }],
    bridges: [],
    pickups: [
      { route: -1, at: 0.18, d: 3 },
      { route: -1, at: 0.58, d: -3 },
      { route: -1, at: 0.95, d: 6 },
      { route: 0, at: 0.5, d: 0 },
      { route: 2, at: 0.5, d: 0 },
      { route: -1, at: 0.5, d: 3, kind: 'turbo' },
      { route: -1, at: 0.85, d: 9, kind: 'turbo' },
    ],
    obstacles: [
      { at: 0.3, d: 6, kind: 'cones' },
      { at: 0.68, d: -6, kind: 'cones' },
      { at: 0.9, d: 6, kind: 'cones' },
    ],
    crossings: [{ at: 0.11, period: 40, offset: 26 }],
    trafficDensity: 18,
    trafficMix: { car: 3, taxi: 1, van: 3, bus: 1, truck: 4 },
    roadworks: [],
    roadworksPerRace: 0,
    rival: 'luna',
    grades: { s: 85000, a: 68000, b: 50000 },
    challenges: [
      { kind: 'explode', target: 3 },
      { kind: 'beatRival', target: 0 },
      { kind: 'noCrash', target: 0 },
    ],
    unlockStars: 0,
    theme: {
      sky: 0xa9c6d9,
      fog: 0xcfd8dc,
      ground: 0x8a8f7a,
      road: 0x363a40,
      buildings: [0x9aa5b1, 0xb5651d, 0x8d99ae, 0xc97b4a, 0x6c757d, 0xa3b18a, 0xd9c8a9, 0x7d8597],
    },
    seed: 1985,
  },
  {
    id: 'hills',
    nameKey: 'stage.hills.name',
    descriptionKey: 'stage.hills.desc',
    difficulty: 5,
    scenery: 'hills',
    controlPoints: [
      [0, -40, 0],
      [0, 0, 0],
      [0, 200, 0],
      [60, 360, 0],
      [200, 440, 0],
      [360, 420, 0],
      [480, 520, 0],
      [520, 700, 0],
      [460, 880, 0],
      [320, 960, 0],
      [160, 1000, 0],
      [60, 1120, 0],
      [80, 1300, 0],
      [200, 1420, 0],
      [380, 1460, 0],
      [560, 1400, 0],
      [700, 1480, 0],
      [760, 1660, 0],
      [720, 1860, 0],
      [600, 1980, 0],
      [460, 2080, 0],
      [440, 2260, 0],
      [520, 2420, 0],
      [680, 2500, 0],
      [860, 2520, 0],
      [920, 2520, 0],
    ],
    profile: [
      { at: 0, y: 0 },
      { at: 0.03, y: 0 },
      { at: 0.06, y: 6 },
      { at: 0.075, y: 6.5 },
      { at: 0.085, y: 0.5 },
      { at: 0.095, y: 0 },
      { at: 0.1, y: 0 },
      { at: 0.12, y: 9 },
      { at: 0.16, y: 9 },
      { at: 0.18, y: 0 },
      { at: 0.32, y: 0 },
      { at: 0.35, y: 7 },
      { at: 0.36, y: 7.3 },
      { at: 0.37, y: 1 },
      { at: 0.38, y: 0 },
      { at: 0.52, y: 0 },
      { at: 0.57, y: 9 },
      { at: 0.61, y: 12 },
      { at: 0.62, y: 12 },
      { at: 0.635, y: 4 },
      { at: 0.66, y: 3 },
      { at: 0.69, y: 8 },
      { at: 0.7, y: 8 },
      { at: 0.712, y: 1.5 },
      { at: 0.73, y: 0 },
      { at: 0.93, y: 0 },
      { at: 0.95, y: 3 },
      { at: 0.958, y: 0.5 },
      { at: 0.966, y: 3.2 },
      { at: 0.975, y: 0 },
      { at: 1, y: 0 },
    ],
    roadHalfWidth: 8.5,
    lanes: { forward: [4], oncoming: [-4] },
    startTime: 45,
    checkpoints: [
      { at: 0.2, bonus: 34 },
      { at: 0.42, bonus: 32 },
      { at: 0.63, bonus: 28 },
      { at: 0.83, bonus: 24 },
    ],
    ramps: [
      { at: 0.26, d: 4, width: 6 },
      { at: 0.87, d: -4, width: 6 },
    ],
    shortcuts: [
      { from: 0.19, to: 0.31, side: 1, kind: 'dirt' },
      { from: 0.8, to: 0.92, side: -1, kind: 'dirt' },
    ],
    tunnels: [{ from: 0.4, to: 0.5 }],
    bridges: [{ from: 0.125, to: 0.155 }],
    pickups: [
      { route: -1, at: 0.2, d: -4 },
      { route: -1, at: 0.58, d: 4 },
      { route: 0, at: 0.5, d: 0 },
      { route: -1, at: 0.4, d: 4, kind: 'turbo' },
      { route: -1, at: 0.7, d: 4, kind: 'turbo' },
    ],
    trafficDensity: 8,
    trafficMix: { car: 5, van: 2, truck: 2, bus: 1 },
    oncomingSpeedScale: 1.3,
    roadworks: [],
    roadworksPerRace: 0,
    rival: 'nitro',
    grades: { s: 90000, a: 72000, b: 54000 },
    challenges: [
      { kind: 'nearMiss', target: 8 },
      { kind: 'beatRival', target: 0 },
      { kind: 'wheelieStreak', target: 3 },
    ],
    unlockStars: 0,
    theme: {
      sky: 0x87ceeb,
      fog: 0xd6eadf,
      ground: 0x7fb069,
      road: 0x45474d,
      buildings: [0xf4e1c1, 0xe8c39e, 0xf2d0a4, 0xdcc7aa, 0xffe8d6, 0xe9d8a6],
    },
    seed: 2000,
  },
  {
    id: 'harborNight',
    nameKey: 'stage.harborNight.name',
    descriptionKey: 'stage.harborNight.desc',
    difficulty: 5,
    scenery: 'city',
    controlPoints: [
      [0, -40, 0],
      [0, 0, 0],
      [0, 220, 0],
      [40, 400, 2],
      [160, 540, 6],
      [340, 580, 8],
      [520, 540, 6],
      [640, 420, 2],
      [700, 240, 0],
      [820, 110, 0],
      [1000, 90, 3],
      [1160, 170, 8],
      [1240, 330, 10],
      [1220, 530, 6],
      [1120, 690, 2],
      [1140, 870, 0],
      [1260, 990, 0],
      [1460, 1010, 0],
      [1520, 1010, 0],
    ],
    roadHalfWidth: 12,
    lanes: { forward: [3, 9], oncoming: [-3, -9] },
    startTime: 40,
    checkpoints: [
      { at: 0.22, bonus: 30 },
      { at: 0.46, bonus: 28 },
      { at: 0.7, bonus: 25 },
    ],
    ramps: [
      { at: 0.12, d: 0, width: 8 },
      { at: 0.4, d: -6, width: 8 },
      { at: 0.63, d: 6, width: 8 },
      { at: 0.85, d: 0, width: 10 },
    ],
    profile: [
      { at: 0, y: 0 },
      { at: 0.045, y: 0 },
      { at: 0.053, y: 2.6 },
      { at: 0.061, y: 0.4 },
      { at: 0.069, y: 3 },
      { at: 0.077, y: 0 },
      { at: 0.29, y: 0 },
      { at: 0.31, y: 9 },
      { at: 0.37, y: 9 },
      { at: 0.39, y: 0 },
      { at: 0.72, y: 0 },
      { at: 0.728, y: 3.2 },
      { at: 0.736, y: 0.6 },
      { at: 0.744, y: 3.4 },
      { at: 0.752, y: 0.8 },
      { at: 0.76, y: 3 },
      { at: 0.768, y: 0 },
      { at: 1, y: 0 },
    ],
    shortcuts: [
      { from: 0.13, to: 0.29, side: -1, kind: 'alley' },
      { from: 0.415, to: 0.515, side: 1, kind: 'shop' },
      { from: 0.61, to: 0.71, side: 1, kind: 'alley' },
      { from: 0.785, to: 0.88, side: -1, kind: 'shop' },
    ],
    tunnels: [{ from: 0.53, to: 0.6 }],
    bridges: [{ from: 0.3, to: 0.38 }],
    pickups: [
      { route: -1, at: 0.09, d: 6 },
      { route: -1, at: 0.42, d: -6 },
      { route: -1, at: 0.61, d: 3 },
      { route: -1, at: 0.9, d: -3 },
      { route: 0, at: 0.5, d: 0 },
      { route: 2, at: 0.5, d: 0 },
      { route: -1, at: 0.33, d: 9, kind: 'turbo' },
      { route: -1, at: 0.76, d: 3, kind: 'turbo' },
    ],
    trafficDensity: 19,
    roadworks: [
      { at: 0.08, d: 9, length: 40 },
      { at: 0.18, d: -9, length: 50 },
      { at: 0.33, d: 3, length: 30 },
      { at: 0.5, d: -3, length: 45 },
      { at: 0.66, d: 9, length: 40 },
      { at: 0.8, d: -9, length: 50 },
      { at: 0.92, d: 3, length: 35 },
    ],
    roadworksPerRace: 3,
    rival: 'nitro',
    grades: { s: 80000, a: 65000, b: 50000 },
    challenges: [
      { kind: 'nearMiss', target: 12 },
      { kind: 'combo', target: 6 },
      { kind: 'beatRival', target: 0 },
    ],
    unlockStars: 2,
    theme: {
      sky: 0x14163a,
      fog: 0x2a2f5c,
      ground: 0x2f4a3a,
      road: 0x2a2d38,
      buildings: [0x6d597a, 0x355070, 0xb56576, 0x3d5a80, 0x6a4c93, 0x1982c4, 0x8ac926, 0xe56b6f],
      night: true,
    },
    seed: 2026,
  },
];

export const getStage = (id: string): StageDef => {
  const s = STAGES.find((x) => x.id === id);
  if (!s) throw new Error(`Unknown stage: ${id}`);
  return s;
};

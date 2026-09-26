import type { ChallengeDef, GradeThresholds } from './challenges';

export interface ShortcutDef {
  /** Course fractions where the shortcut leaves and rejoins the main road. */
  readonly from: number;
  readonly to: number;
  /** Side of the main road it branches off: +1 right, -1 left. */
  readonly side: 1 | -1;
  /** Alleys are plain back streets; shops put a store (with breakable windows) at each end. */
  readonly kind: 'alley' | 'shop';
}

export interface StageDef {
  readonly id: string;
  readonly nameKey: string;
  readonly descriptionKey: string;
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
  /** Explosive bonus boxes. `route` is -1 for the main road or a shortcut index; `at` is a fraction of it. */
  readonly pickups: readonly { readonly route: number; readonly at: number; readonly d: number }[];
  /** Target amount of traffic vehicles around the player. */
  readonly trafficDensity: number;
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

const HARBOR: StageDef = {
  id: 'harbor',
  nameKey: 'stage.harbor.name',
  descriptionKey: 'stage.harbor.desc',
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
  grades: { s: 80000, a: 65000, b: 50000 },
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
};

/** Same streets at night: heavier traffic, a faster rival and tougher challenges. */
const HARBOR_NIGHT: StageDef = {
  ...HARBOR,
  id: 'harborNight',
  nameKey: 'stage.harborNight.name',
  descriptionKey: 'stage.harborNight.desc',
  trafficDensity: 22,
  roadworksPerRace: 3,
  rival: 'nitro',
  grades: { s: 90000, a: 72000, b: 55000 },
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
};

export const STAGES: readonly StageDef[] = [HARBOR, HARBOR_NIGHT];

export const getStage = (id: string): StageDef => {
  const s = STAGES.find((x) => x.id === id);
  if (!s) throw new Error(`Unknown stage: ${id}`);
  return s;
};

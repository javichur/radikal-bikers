export interface StageDef {
  readonly id: string;
  readonly nameKey: string;
  readonly descriptionKey: string;
  /** Road centreline control points: [x, z, elevation]. */
  readonly controlPoints: readonly (readonly [number, number, number])[];
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
  /** Target amount of traffic vehicles around the player. */
  readonly trafficDensity: number;
  readonly theme: {
    readonly sky: number;
    readonly fog: number;
    readonly ground: number;
    readonly road: number;
    readonly buildings: readonly number[];
  };
  readonly seed: number;
}

export const STAGES: readonly StageDef[] = [
  {
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
    trafficDensity: 16,
    theme: {
      sky: 0x7ec8ff,
      fog: 0xbfe3ff,
      ground: 0x9ccf6a,
      road: 0x3b3f4a,
      buildings: [0xffb4a2, 0xffd6a5, 0xcaffbf, 0x9bf6ff, 0xa0c4ff, 0xbdb2ff, 0xffc6ff, 0xfdffb6],
    },
    seed: 1998,
  },
];

export const getStage = (id: string): StageDef => {
  const s = STAGES.find((x) => x.id === id);
  if (!s) throw new Error(`Unknown stage: ${id}`);
  return s;
};

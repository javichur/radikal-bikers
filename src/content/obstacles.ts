export type ObstacleKind = 'cones' | 'barrier' | 'fountain';

export interface ObstacleDef {
  readonly kind: ObstacleKind;
  /** Half extents in track space (along / across the road), metres. */
  readonly halfLength: number;
  readonly halfWidth: number;
  /** A bike flying higher than this clears it. */
  readonly height: number;
  /** Solid obstacles knock the rider down (or block him); the rest are just knocked over at a speed cost. */
  readonly solid: boolean;
  /** Solid obstacles the explosive bonus cannot smash. */
  readonly indestructible?: boolean;
}

export const OBSTACLES: Readonly<Record<ObstacleKind, ObstacleDef>> = {
  /** A line of traffic cones along the centre of the road. */
  cones: { kind: 'cones', halfLength: 3, halfWidth: 0.35, height: 0.8, solid: false },
  /** Road works fence against the kerb. */
  barrier: { kind: 'barrier', halfLength: 2.5, halfWidth: 0.9, height: 1.1, solid: true },
  /** Square fountain in the middle of a piazza: traffic flows on both sides. */
  fountain: { kind: 'fountain', halfLength: 2, halfWidth: 2, height: 2.6, solid: true, indestructible: true },
};

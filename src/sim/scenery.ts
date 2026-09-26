import type { Track } from './track';

/** A river crossed by a bridge: a straight strip perpendicular to the road at the middle of the bridge. */
export interface River {
  readonly x: number;
  readonly z: number;
  /** Road heading at the crossing (the river flows across it). */
  readonly heading: number;
  /** Half width measured along the road. */
  readonly halfWidth: number;
  /** Half length measured across the road. */
  readonly halfLength: number;
}

export const RIVER_HALF_WIDTH = 45;
export const RIVER_HALF_LENGTH = 320;

export const riverOf = (track: Track, bridge: { readonly from: number; readonly to: number }): River => {
  const p = track.sample(((bridge.from + bridge.to) / 2) * track.length);
  return { x: p.x, z: p.z, heading: p.heading, halfWidth: RIVER_HALF_WIDTH, halfLength: RIVER_HALF_LENGTH };
};

/** Whether a world XZ point is on the river (grown by `margin`). */
export const inRiver = (r: River, x: number, z: number, margin = 0): boolean => {
  const dx = x - r.x;
  const dz = z - r.z;
  const along = dx * Math.sin(r.heading) + dz * Math.cos(r.heading);
  const across = -dx * Math.cos(r.heading) + dz * Math.sin(r.heading);
  return Math.abs(along) < r.halfWidth + margin && Math.abs(across) < r.halfLength + margin;
};

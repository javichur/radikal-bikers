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
  /** Dry riverbed (a grassy park) instead of water. */
  readonly dry?: boolean;
}

export const RIVER_HALF_WIDTH = 45;
export const RIVER_HALF_LENGTH = 320;

export const riverOf = (
  track: Track,
  bridge: {
    readonly from: number;
    readonly to: number;
    readonly river?: { readonly halfWidth: number; readonly halfLength: number; readonly dry?: boolean };
  },
): River => {
  const p = track.sample(((bridge.from + bridge.to) / 2) * track.length);
  return {
    x: p.x,
    z: p.z,
    heading: p.heading,
    halfWidth: bridge.river?.halfWidth ?? RIVER_HALF_WIDTH,
    halfLength: bridge.river?.halfLength ?? RIVER_HALF_LENGTH,
    dry: bridge.river?.dry ?? false,
  };
};

/** Whether a world XZ point is on the river (grown by `margin`). */
export const inRiver = (r: River, x: number, z: number, margin = 0): boolean => {
  const dx = x - r.x;
  const dz = z - r.z;
  const along = dx * Math.sin(r.heading) + dz * Math.cos(r.heading);
  const across = -dx * Math.cos(r.heading) + dz * Math.sin(r.heading);
  return Math.abs(along) < r.halfWidth + margin && Math.abs(across) < r.halfLength + margin;
};

export const RAIL_HALF_LENGTH = 300;

/** Railway of a level crossing, as a straight strip across the road (same shape as a river). */
export const railOf = (track: Track, at: number): River => {
  const p = track.sample(at * track.length);
  return { x: p.x, z: p.z, heading: p.heading, halfWidth: 3, halfLength: RAIL_HALF_LENGTH };
};

type Polygon = readonly (readonly [number, number])[];

/** Whether a world XZ point lies inside a polygon (even-odd rule). */
export const inPolygon = (poly: Polygon, x: number, z: number): boolean => {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i]!;
    const [xj, zj] = poly[j]!;
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
};

/** Distance from a world XZ point to the edge of a polygon (0 inside). */
export const polygonDistance = (poly: Polygon, x: number, z: number): number => {
  if (inPolygon(poly, x, z)) return 0;
  let best = Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [ax, az] = poly[j]!;
    const [bx, bz] = poly[i]!;
    const dx = bx - ax;
    const dz = bz - az;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1)));
    best = Math.min(best, Math.hypot(x - (ax + dx * t), z - (az + dz * t)));
  }
  return best;
};

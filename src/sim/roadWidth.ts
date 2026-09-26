import { lerp } from '../core/math';
import type { StageDef } from '../content/stages';
import type { WorkZone } from './roadworks';

/** Length (m) over which the carriageway tapers into and out of a narrow street. */
export const NARROW_TAPER = 30;
/** Room a lane needs on its outer side (half the widest vehicle plus a margin) to stay open in a narrow street. */
export const LANE_CLEARANCE = 1.6;

/** A narrow stretch of the main road, in metres along it. */
export interface Narrow {
  readonly from: number;
  readonly to: number;
  readonly halfWidth: number;
}

export const narrowsOf = (stage: StageDef, trackLength: number): Narrow[] =>
  (stage.narrows ?? []).map((n) => ({ from: n.from * trackLength, to: n.to * trackLength, halfWidth: n.halfWidth }));

/** Half width of the main carriageway at `s`: the stage width, squeezed in narrow streets (with linear tapers). */
export const halfWidthAt = (base: number, narrows: readonly Narrow[], s: number): number => {
  let hw = base;
  for (const n of narrows) {
    if (s <= n.from - NARROW_TAPER || s >= n.to + NARROW_TAPER) continue;
    let w = n.halfWidth;
    if (s < n.from) w = lerp(base, n.halfWidth, (s - (n.from - NARROW_TAPER)) / NARROW_TAPER);
    else if (s > n.to) w = lerp(n.halfWidth, base, (s - n.to) / NARROW_TAPER);
    hw = Math.min(hw, w);
  }
  return hw;
};

/** Whether a lane centred at `d` still fits in a carriageway of half width `hw`. */
export const laneFits = (d: number, hw: number): boolean => Math.abs(d) + LANE_CLEARANCE <= hw;

/** The lanes that do not fit in each narrow street, closed like roadworks from the start of the taper to its end. */
export const narrowClosures = (narrows: readonly Narrow[], lanes: readonly number[]): WorkZone[] =>
  narrows.flatMap((n) =>
    lanes
      .filter((d) => !laneFits(d, n.halfWidth))
      .map((d) => ({ from: n.from - NARROW_TAPER, to: n.to + NARROW_TAPER, d })),
  );

/**
 * Whether a vehicle spawned at `s` driving in direction `dir` could reach a narrow street within `reach` metres: the
 * old-town streets are closed to buses, lorries and trams, so only light vehicles spawn there.
 */
export const reachesNarrow = (narrows: readonly Narrow[], s: number, dir: 1 | -1, reach: number): boolean =>
  narrows.some((n) =>
    dir === 1
      ? s > n.from - NARROW_TAPER - reach && s < n.to + NARROW_TAPER
      : s > n.from - NARROW_TAPER && s < n.to + NARROW_TAPER + reach,
  );

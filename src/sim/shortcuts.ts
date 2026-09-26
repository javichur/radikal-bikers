import { lerp } from '../core/math';
import type { ShortcutDef } from '../content/stages';
import { Track } from './track';

/** Half width of the drivable lane of a shortcut (alleys and shops). */
export const ROUTE_HALF_WIDTH = 5;
/** Width of the main road sidewalks. */
export const SIDEWALK = 4.5;
/** Gap between the sidewalk and the building facades along the main road. */
export const FACADE_GAP = 1.5;
/** Depth of a shop you can ride through. */
export const SHOP_DEPTH = 14;
/** Lateral distance of an alley (beyond the first row of buildings). */
const ALLEY_OFFSET = 24;
const MOUTH_RUN = 20;
const ALLEY_RUN = 42;

export interface Range {
  readonly from: number;
  readonly to: number;
}

export interface GlassPane {
  /** Position along the route. */
  readonly s: number;
  broken: boolean;
}

/** A shortcut: an alternative road that leaves the main road on one side and joins it again further on. */
export interface Route {
  readonly index: number;
  readonly kind: ShortcutDef['kind'];
  /** +1 right, -1 left of the main road. */
  readonly side: 1 | -1;
  readonly track: Track;
  /** Main-road distances where the route starts and ends. */
  readonly fromS: number;
  readonly toS: number;
  /** Main-road interval with no wall on `side`: riding into it enters the shortcut. */
  readonly entry: Range;
  /** Main-road intervals where the route crosses the sidewalk (visual gaps in curbs and buildings). */
  readonly mouths: readonly Range[];
  /** Shop windows, in route coordinates (only for shops). */
  readonly panes: GlassPane[];
  /** Route intervals inside a shop (between its front and back windows). */
  readonly shops: readonly Range[];
}

type P3 = [number, number, number];

const facade = (hw: number): number => hw + SIDEWALK + FACADE_GAP;

/** Builds the geometry of a shortcut from its definition relative to the main road. */
export const buildRoute = (main: Track, hw: number, def: ShortcutDef, index: number): Route => {
  const s0 = def.from * main.length;
  const s1 = def.to * main.length;
  const side = def.side;
  const e = facade(hw);
  const at = (s: number, d: number): P3 => {
    const p = main.toWorld(s, side * d);
    return [p.x, p.z, main.heightAt(s)];
  };
  const a = at(s0 + ALLEY_RUN, e + ALLEY_OFFSET);
  const b = at(s1 - ALLEY_RUN, e + ALLEY_OFFSET);
  const chord: P3[] = [1, 2, 3].map((k) => [lerp(a[0], b[0], k / 4), lerp(a[1], b[1], k / 4), lerp(a[2], b[2], k / 4)]);
  const track = new Track([
    at(s0, hw - 2),
    at(s0 + MOUTH_RUN, e + SHOP_DEPTH / 2),
    a,
    ...chord,
    b,
    at(s1 - MOUTH_RUN, e + SHOP_DEPTH / 2),
    at(s1, hw - 2),
  ]);

  const toRoute = (s: number, d: number): { s: number; d: number } => {
    const p = main.toWorld(s, side * d);
    return track.project(p.x, p.z);
  };

  // Where can the rider get in? Wherever the main road edge lies well inside the route lane.
  let entryFrom = Infinity;
  let entryTo = -Infinity;
  for (let s = s0 - 10; s <= s0 + 60; s += 0.5) {
    const r = toRoute(s, hw - 0.6);
    if (r.s > 0.5 && r.s < track.length / 2 && Math.abs(r.d) < ROUTE_HALF_WIDTH - 0.6) {
      entryFrom = Math.min(entryFrom, s);
      entryTo = Math.max(entryTo, s);
    }
  }
  if (entryFrom > entryTo) throw new Error(`Shortcut ${index} has no usable entry`);

  // Sidewalk gaps at both ends.
  const mouth = (sa: number, sb: number): Range => {
    let from = Infinity;
    let to = -Infinity;
    for (let s = sa; s <= sb; s += 0.5) {
      for (const d of [hw, hw + SIDEWALK / 2, hw + SIDEWALK]) {
        if (Math.abs(toRoute(s, d).d) < ROUTE_HALF_WIDTH + 0.3) {
          from = Math.min(from, s);
          to = Math.max(to, s);
        }
      }
    }
    return { from, to };
  };
  const mouths = [mouth(s0 - 10, s0 + 70), mouth(s1 - 70, s1 + 10)];

  // Shop windows: where the route crosses the facade line and the back of the shop.
  const panes: GlassPane[] = [];
  const shops: Range[] = [];
  if (def.kind === 'shop') {
    const lateral = (s: number): number => {
      const p = track.sample(s);
      return side * main.project(p.x, p.z, lerp(s0, s1, s / track.length), 120).d;
    };
    const crossing = (from: number, to: number, value: number): number => {
      const dir = Math.sign(to - from);
      for (let s = from; dir * (to - s) > 0; s += dir * 0.25) {
        if ((lateral(s) - value) * (lateral(s + dir * 0.25) - value) <= 0) return s + dir * 0.125;
      }
      throw new Error(`Shop ${index} does not cross its facade`);
    };
    const half = track.length / 2;
    const front1 = crossing(0, half, e);
    const back1 = crossing(0, half, e + SHOP_DEPTH);
    const back2 = crossing(track.length, half, e + SHOP_DEPTH);
    const front2 = crossing(track.length, half, e);
    for (const s of [front1, back1, back2, front2]) panes.push({ s, broken: false });
    shops.push({ from: front1, to: back1 }, { from: back2, to: front2 });
  }

  return {
    index,
    kind: def.kind,
    side,
    track,
    fromS: s0,
    toS: s1,
    entry: { from: entryFrom, to: entryTo },
    mouths,
    panes,
    shops,
  };
};

/** Approximate main-road distance equivalent to a position along a route (for race progress and traffic). */
export const routeToMainS = (r: Route, s: number): number => lerp(r.fromS, r.toS, s / r.track.length);

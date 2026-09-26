import { Rng } from '../core/rng';
import type { StageDef } from '../content/stages';

/** A lane closed by roadworks on the main road. */
export interface WorkZone {
  readonly from: number;
  readonly to: number;
  /** Lane centre that is closed. */
  readonly d: number;
}

export interface Cone {
  readonly s: number;
  readonly d: number;
  /** Knocked over by the rider (stays down for the rest of the race). */
  hit: boolean;
}

export const CONE_RADIUS = 0.35;
const CONE_SPACING = 5;

/** Picks this race's roadworks among the stage candidates (deterministic for a seed). */
export const pickWorkZones = (stage: StageDef, trackLength: number, seed: number): WorkZone[] => {
  const rng = new Rng(seed ^ 0x5eed);
  const pool = [...stage.roadworks];
  const zones: WorkZone[] = [];
  for (let i = 0; i < stage.roadworksPerRace && pool.length; i++) {
    const [w] = pool.splice(rng.int(0, pool.length - 1), 1);
    const from = w!.at * trackLength;
    zones.push({ from, to: from + w!.length, d: w!.d });
  }
  return zones.sort((a, b) => a.from - b.from);
};

/** A diagonal taper closing the lane, then a line of cones along it. */
export const buildCones = (zones: readonly WorkZone[]): Cone[] => {
  const cones: Cone[] = [];
  for (const z of zones) {
    const taper = [-1.5, -0.5, 0.5, 1.5];
    taper.forEach((o, i) => cones.push({ s: z.from + i * 1.2, d: z.d + o * Math.sign(z.d), hit: false }));
    for (let s = z.from + CONE_SPACING; s <= z.to; s += CONE_SPACING) cones.push({ s, d: z.d, hit: false });
  }
  return cones;
};

/** True when the lane `d` is closed at `s`, with `margin` metres of lead-in. */
export const laneClosed = (zones: readonly WorkZone[], s: number, d: number, margin = 0): boolean =>
  zones.some((z) => Math.abs(z.d - d) < 1 && s >= z.from - margin && s <= z.to + margin);

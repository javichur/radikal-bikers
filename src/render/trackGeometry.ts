import * as THREE from 'three';
import type { Range } from '../sim/shortcuts';
import type { Track } from '../sim/track';

/** What the sweeps need from a track: its length and the (distance, lateral offset) → world mapping. */
export type Frame = Pick<Track, 'toWorld' | 'length'>;

/**
 * The main road as the city is laid out along it where its width varies: lateral offsets are given for the stage's
 * base half width `base` and are squeezed to the local half width `hwAt(s)` — proportionally across the carriageway
 * and shifted beyond it — so sidewalks, curbs and facades follow narrow streets.
 */
export const widened = (track: Track, hwAt: (s: number) => number, base: number): Frame => ({
  length: track.length,
  toWorld: (s, d) => {
    const hw = hwAt(s);
    if (hw === base) return track.toWorld(s, d);
    return track.toWorld(s, Math.abs(d) <= base ? (d * hw) / base : d + Math.sign(d) * (hw - base));
  },
});

const build = (pos: number[], uv: number[], idx: number[]): THREE.BufferGeometry => {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
};

const samples = (from: number, to: number, step: number): number[] => {
  const n = Math.max(1, Math.ceil((to - from) / step));
  return Array.from({ length: n + 1 }, (_, i) => from + ((to - from) * i) / n);
};

/**
 * Sweeps a cross-section along a track. `profile` points are [lateral offset, height above the road]; when
 * `absolute` is set the heights are measured from the ground (y = 0) instead of the road surface.
 */
export const sweep = (
  track: Frame,
  profile: readonly (readonly [number, number])[],
  from: number,
  to: number,
  step = 2,
  vScale = 8,
  absolute: readonly boolean[] = [],
): THREE.BufferGeometry => {
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  const m = profile.length;
  const ss = samples(from, to, step);
  ss.forEach((s, i) => {
    profile.forEach(([d, y], j) => {
      const p = track.toWorld(s, d);
      pos.push(p.x, absolute[j] ? y : p.y + y, p.z);
      uv.push(j / (m - 1), s / vScale);
    });
    if (i > 0) {
      for (let j = 0; j < m - 1; j++) {
        const a = (i - 1) * m + j;
        const b = i * m + j;
        idx.push(a, a + 1, b, a + 1, b + 1, b);
      }
    }
  });
  return build(pos, uv, idx);
};

/** Flat strip following the track between lateral offsets d0..d1, `lift` above the road. */
export const ribbon = (
  track: Frame,
  d0: number,
  d1: number,
  lift: number,
  step: number,
  vScale: number,
  from = 0,
  to = track.length,
): THREE.BufferGeometry =>
  sweep(
    track,
    [
      [d0, lift],
      [d1, lift],
    ],
    from,
    to,
    step,
    vScale,
  );

/** Vertical strip at lateral offset d, from `bottom` to `top` above the road (or from the ground if `toGround`). */
export const wall = (
  track: Frame,
  d: number,
  bottom: number,
  top: number,
  from: number,
  to: number,
  step = 2,
  vScale = 4,
  toGround = false,
): THREE.BufferGeometry =>
  sweep(
    track,
    [
      [d, toGround ? -0.05 : bottom],
      [d, top],
    ],
    from,
    to,
    step,
    vScale,
    [toGround, false],
  );

/** [from, to] minus the gaps. */
export const segments = (from: number, to: number, gaps: readonly Range[]): Range[] => {
  const sorted = [...gaps].filter((g) => g.to > from && g.from < to).sort((a, b) => a.from - b.from);
  const out: Range[] = [];
  let cur = from;
  for (const g of sorted) {
    if (g.from > cur) out.push({ from: cur, to: g.from });
    cur = Math.max(cur, g.to);
  }
  if (cur < to) out.push({ from: cur, to });
  return out;
};

/** Contiguous ranges of s (sampled every `step`) where `test` holds. */
export const rangesWhere = (from: number, to: number, step: number, test: (s: number) => boolean): Range[] => {
  const out: Range[] = [];
  let start: number | null = null;
  for (let s = from; s <= to + 1e-6; s += step) {
    const ok = test(s);
    if (ok && start === null) start = s;
    if (!ok && start !== null) {
      out.push({ from: start, to: s - step });
      start = null;
    }
  }
  if (start !== null) out.push({ from: start, to });
  return out.filter((r) => r.to > r.from);
};

export const inRanges = (s: number, ranges: readonly Range[], pad = 0): boolean =>
  ranges.some((r) => s >= r.from - pad && s <= r.to + pad);

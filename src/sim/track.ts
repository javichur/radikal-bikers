import { clamp, lerp, wrapAngle } from '../core/math';

export interface TrackSample {
  readonly x: number;
  readonly z: number;
  /** Visual elevation of the road surface. */
  readonly y: number;
  /** Heading angle: forward = (sin h, cos h) in the XZ plane. */
  readonly heading: number;
  /** Signed curvature dh/ds (positive = road turns left). */
  readonly curvature: number;
  /** Road gradient dy/ds (positive = uphill). */
  readonly slope: number;
}

type Point3 = readonly [number, number, number];

/** Elevation key: `at` is a fraction of the course length, `y` the road height there (metres). */
export interface ProfileKey {
  readonly at: number;
  readonly y: number;
}

const smoothstep = (t: number): number => t * t * (3 - 2 * t);

/** Smooth piecewise elevation (zero gradient at every key) sampled by course fraction. */
export const profileHeight = (keys: readonly ProfileKey[], f: number): number => {
  if (keys.length === 0) return 0;
  const first = keys[0]!;
  if (f <= first.at) return first.y;
  for (let i = 1; i < keys.length; i++) {
    const a = keys[i - 1]!;
    const b = keys[i]!;
    if (f <= b.at) return b.at > a.at ? lerp(a.y, b.y, smoothstep((f - a.at) / (b.at - a.at))) : b.y;
  }
  return keys[keys.length - 1]!.y;
};

const catmullRom = (p0: number, p1: number, p2: number, p3: number, t: number): number => {
  const t2 = t * t;
  const t3 = t2 * t;
  return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
};

/**
 * A road centreline sampled at uniform arc-length spacing.
 * The simulation works in track space (s = distance along, d = lateral offset).
 */
export class Track {
  readonly length: number;
  readonly step: number;
  private readonly xs: Float64Array;
  private readonly zs: Float64Array;
  private readonly ys: Float64Array;
  private readonly hs: Float64Array;
  private readonly ks: Float64Array;
  private readonly gs: Float64Array;

  /**
   * @param profile optional elevation keys; when given they replace the control points' elevation, which lets a
   *   stage describe hills, crests and bridges independently of the road layout.
   */
  constructor(controlPoints: readonly Point3[], step = 1, profile?: readonly ProfileKey[]) {
    if (controlPoints.length < 2) throw new Error('Track needs at least 2 control points');
    this.step = step;

    // 1. Dense polyline through the control points.
    const dense: [number, number, number][] = [];
    const pts = controlPoints;
    const get = (i: number): Point3 => pts[clamp(i, 0, pts.length - 1)] as Point3;
    const SUB = 32;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = get(i - 1);
      const p1 = get(i);
      const p2 = get(i + 1);
      const p3 = get(i + 2);
      for (let j = 0; j < SUB; j++) {
        const t = j / SUB;
        dense.push([
          catmullRom(p0[0], p1[0], p2[0], p3[0], t),
          catmullRom(p0[1], p1[1], p2[1], p3[1], t),
          catmullRom(p0[2], p1[2], p2[2], p3[2], t),
        ]);
      }
    }
    const last = pts[pts.length - 1] as Point3;
    dense.push([last[0], last[1], last[2]]);

    // 2. Cumulative length.
    const cum = new Float64Array(dense.length);
    for (let i = 1; i < dense.length; i++) {
      const a = dense[i - 1]!;
      const b = dense[i]!;
      cum[i] = cum[i - 1]! + Math.hypot(b[0] - a[0], b[1] - a[1]);
    }
    const total = cum[dense.length - 1]!;
    const n = Math.floor(total / step) + 1;
    this.length = (n - 1) * step;

    // 3. Uniform resampling.
    this.xs = new Float64Array(n);
    this.zs = new Float64Array(n);
    this.ys = new Float64Array(n);
    let seg = 0;
    for (let i = 0; i < n; i++) {
      const s = i * step;
      while (seg < dense.length - 2 && cum[seg + 1]! < s) seg++;
      const segLen = cum[seg + 1]! - cum[seg]!;
      const t = segLen > 0 ? clamp((s - cum[seg]!) / segLen, 0, 1) : 0;
      const a = dense[seg]!;
      const b = dense[seg + 1]!;
      this.xs[i] = lerp(a[0], b[0], t);
      this.zs[i] = lerp(a[1], b[1], t);
      this.ys[i] = profile ? profileHeight(profile, s / this.length) : lerp(a[2], b[2], t);
    }

    // 4. Headings and (smoothed) curvature.
    this.hs = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const a = Math.max(0, i - 1);
      const b = Math.min(n - 1, i + 1);
      this.hs[i] = Math.atan2(this.xs[b]! - this.xs[a]!, this.zs[b]! - this.zs[a]!);
    }
    const raw = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const a = Math.max(0, i - 1);
      const b = Math.min(n - 1, i + 1);
      raw[i] = b > a ? wrapAngle(this.hs[b]! - this.hs[a]!) / ((b - a) * step) : 0;
    }
    this.ks = new Float64Array(n);
    const W = 3;
    for (let i = 0; i < n; i++) {
      let sum = 0;
      let cnt = 0;
      for (let j = Math.max(0, i - W); j <= Math.min(n - 1, i + W); j++) {
        sum += raw[j]!;
        cnt++;
      }
      this.ks[i] = sum / cnt;
    }
    this.gs = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const a = Math.max(0, i - 1);
      const b = Math.min(n - 1, i + 1);
      this.gs[i] = b > a ? (this.ys[b]! - this.ys[a]!) / ((b - a) * step) : 0;
    }
  }

  sample(s: number): TrackSample {
    const f = clamp(s, 0, this.length) / this.step;
    const i = Math.min(Math.floor(f), this.xs.length - 2);
    const t = f - i;
    const h0 = this.hs[i]!;
    const h1 = this.hs[i + 1]!;
    return {
      x: lerp(this.xs[i]!, this.xs[i + 1]!, t),
      z: lerp(this.zs[i]!, this.zs[i + 1]!, t),
      y: lerp(this.ys[i]!, this.ys[i + 1]!, t),
      heading: h0 + wrapAngle(h1 - h0) * t,
      curvature: lerp(this.ks[i]!, this.ks[i + 1]!, t),
      slope: lerp(this.gs[i]!, this.gs[i + 1]!, t),
    };
  }

  /** Road elevation at distance s. */
  heightAt(s: number): number {
    const f = clamp(s, 0, this.length) / this.step;
    const i = Math.min(Math.floor(f), this.ys.length - 2);
    return lerp(this.ys[i]!, this.ys[i + 1]!, f - i);
  }

  /**
   * Nearest track coordinates (s, d) of a world XZ point.
   * @param hintS / radius restrict the search to [hintS - radius, hintS + radius] (whole course by default).
   */
  project(x: number, z: number, hintS = this.length / 2, radius = this.length): { s: number; d: number } {
    const n = this.xs.length;
    const i0 = clamp(Math.floor((hintS - radius) / this.step), 0, n - 1);
    const i1 = clamp(Math.ceil((hintS + radius) / this.step), 0, n - 1);
    let best = i0;
    let bestD2 = Infinity;
    for (let i = i0; i <= i1; i++) {
      const dx = x - this.xs[i]!;
      const dz = z - this.zs[i]!;
      const d2 = dx * dx + dz * dz;
      if (d2 < bestD2) {
        bestD2 = d2;
        best = i;
      }
    }
    const h = this.hs[best]!;
    const along = (x - this.xs[best]!) * Math.sin(h) + (z - this.zs[best]!) * Math.cos(h);
    const s = clamp(best * this.step + along, 0, this.length);
    const p = this.sample(s);
    const d = (x - p.x) * -Math.cos(p.heading) + (z - p.z) * Math.sin(p.heading);
    return { s, d };
  }

  /** Converts track coordinates (s, d) to world XZ + road elevation. */
  toWorld(s: number, d: number): { x: number; y: number; z: number; heading: number } {
    const p = this.sample(s);
    // Right-hand normal of forward (sin h, cos h) with Y up.
    const rx = -Math.cos(p.heading);
    const rz = Math.sin(p.heading);
    return { x: p.x + rx * d, y: p.y, z: p.z + rz * d, heading: p.heading };
  }
}

import { describe, expect, it } from 'vitest';
import { CHARACTERS } from '../../src/content/characters';
import { MONUMENTS } from '../../src/content/monuments';
import { OBSTACLES } from '../../src/content/obstacles';
import { roundCorners, STAGES } from '../../src/content/stages';
import { DEFAULT_TRAFFIC_MIX, VEHICLE_KINDS, VEHICLES } from '../../src/content/vehicles';
import { BIKE } from '../../src/sim/bike';
import { BARRIER_OFFSET } from '../../src/sim/crossing';
import { inPolygon, inRiver, polygonDistance, railOf, riverOf, type River } from '../../src/sim/scenery';
import { laneFits, NARROW_TAPER } from '../../src/sim/roadWidth';
import { ROUTE_HALF_WIDTH, SIDEWALK } from '../../src/sim/shortcuts';
import { Track } from '../../src/sim/track';
import { World } from '../../src/sim/world';

describe('stage list', () => {
  it('opens with València, always unlocked, then goes from an easy introduction to the hardest route', () => {
    expect(STAGES[0]!.id).toBe('valencia');
    expect(STAGES[0]!.unlockStars).toBe(0);
    const levels = STAGES.slice(1).map((s) => s.difficulty);
    expect([...levels].sort((a, b) => a - b)).toEqual(levels);
    expect(levels[0]).toBe(1);
    expect(new Set(STAGES.map((s) => s.id)).size).toBe(STAGES.length);
    expect(new Set(STAGES.map((s) => s.scenery))).toEqual(
      new Set(['beach', 'city', 'oldtown', 'industrial', 'hills', 'valencia']),
    );
    for (const s of STAGES) expect(s.difficulty).toBeGreaterThanOrEqual(1);
    for (const s of STAGES) expect(s.difficulty).toBeLessThanOrEqual(5);
  });

  it('the easy route gives more time per checkpoint-free stretch and the hard one is the longest', () => {
    const lengths = STAGES.map((s) => new Track(s.controlPoints, 1, s.profile).length);
    const hills = STAGES.find((s) => s.id === 'hills')!;
    expect(Math.max(...lengths)).toBe(new Track(hills.controlPoints, 1, hills.profile).length);
    const first = STAGES.find((s) => s.difficulty === 1)!;
    expect(first.startTime).toBeGreaterThanOrEqual(Math.max(...STAGES.map((s) => s.startTime)));
  });
});

describe('roundCorners', () => {
  it('rounds a right-angle corner to the requested radius', () => {
    const pts = roundCorners(
      [
        [0, 0],
        [0, 300],
        [300, 300],
      ],
      60,
    );
    const t = new Track(pts);
    let maxK = 0;
    for (let s = 0; s < t.length; s += 1) maxK = Math.max(maxK, Math.abs(t.sample(s).curvature));
    expect(1 / maxK).toBeGreaterThan(45);
    expect(1 / maxK).toBeLessThan(70);
    expect(t.sample(t.length).heading).toBeCloseTo(Math.PI / 2, 1);
  });

  it('keeps straight or degenerate corners as plain vertices', () => {
    const pts = roundCorners(
      [
        [0, 1330],
        [0, 2000],
        [0, 2060],
      ],
      60,
    );
    expect(pts.every((p) => p.every(Number.isFinite))).toBe(true);
    expect(new Track(pts).length).toBeGreaterThan(0);
  });
});

describe.each(STAGES.map((s) => [s.id, s] as const))('stage %s', (_id, stage) => {
  const w = new World(stage, CHARACTERS[0]!);
  const L = w.track.length;
  const hw = stage.roadHalfWidth;
  const edge = hw + 0.5 + SIDEWALK;
  /** Road edge (outside of the sidewalk) at a distance along the main road: closer in narrow streets. */
  const edgeAt = (s: number): number => w.halfWidthAt(s) + 0.5 + SIDEWALK;

  it('narrow streets squeeze the road clear of tunnels, bridges and roadworks, and leave a lane each way', () => {
    for (const n of w.narrows) {
      const span = { from: n.from - NARROW_TAPER, to: n.to + NARROW_TAPER };
      expect(n.to).toBeGreaterThan(n.from);
      expect(n.halfWidth).toBeLessThan(hw);
      expect(stage.lanes.forward.some((d) => laneFits(d, n.halfWidth))).toBe(true);
      expect(stage.lanes.oncoming.some((d) => laneFits(d, n.halfWidth))).toBe(true);
      for (const r of [...stage.tunnels, ...stage.bridges]) {
        expect(r.to * L < span.from || r.from * L > span.to).toBe(true);
      }
      for (const z of stage.roadworks) expect(z.at * L + z.length < span.from || z.at * L > span.to).toBe(true);
      expect(w.halfWidthAt((n.from + n.to) / 2)).toBe(n.halfWidth);
      expect(w.halfWidthAt(span.from - 1)).toBe(hw);
      expect(w.halfWidthAt(span.to + 1)).toBe(hw);
    }
  });

  it('never runs close to another stretch of itself', () => {
    for (let a = 0; a < L; a += 5) {
      for (let b = a + 250; b < L; b += 5) {
        const p = w.track.sample(a);
        const q = w.track.sample(b);
        expect(Math.hypot(p.x - q.x, p.z - q.z)).toBeGreaterThan(edge * 2 + 20);
      }
    }
  });

  it('shortcuts are shorter, stay clear of the main road and of each other', () => {
    for (const r of w.routes) {
      expect(r.track.length).toBeLessThan(r.toS - r.fromS);
      expect(r.entry.to).toBeGreaterThan(r.entry.from);
      for (let s = 40; s < r.track.length - 40; s += 4) {
        const p = r.track.sample(s);
        const q = w.track.project(p.x, p.z);
        expect(Math.abs(q.d)).toBeGreaterThan(w.halfWidthAt(q.s) + SIDEWALK + ROUTE_HALF_WIDTH);
      }
    }
    const sorted = [...w.routes].sort((a, b) => a.fromS - b.fromS);
    for (let i = 1; i < sorted.length; i++) expect(sorted[i]!.fromS).toBeGreaterThan(sorted[i - 1]!.toS);
    for (const r of w.routes) {
      for (const t of stage.tunnels) {
        for (const m of r.mouths) expect(m.to < t.from * L - 5 || m.from > t.to * L + 5).toBe(true);
      }
    }
  });

  it('shops have a front and a back window at each end', () => {
    for (const r of w.routes.filter((x) => x.kind === 'shop')) {
      expect(r.panes).toHaveLength(4);
      expect(r.shops).toHaveLength(2);
    }
  });

  it('bridges are raised above the ground and tunnels stay at street level', () => {
    for (const b of stage.bridges) expect(w.track.heightAt(((b.from + b.to) / 2) * L)).toBeGreaterThan(6);
    for (const t of stage.tunnels) {
      for (let f = t.from; f <= t.to; f += 0.002) expect(w.track.heightAt(f * L)).toBeLessThan(0.5);
    }
  });

  it('pickups, ramps, checkpoints and obstacles lie on the road', () => {
    for (const p of w.pickups) {
      const half = p.route < 0 ? w.halfWidthAt(p.s) : ROUTE_HALF_WIDTH;
      expect(Math.abs(p.d)).toBeLessThan(half - BIKE.wallMargin);
      expect(p.s).toBeGreaterThan(0);
      expect(p.s).toBeLessThan(w.trackOf(p.route).length);
    }
    for (const r of w.ramps) expect(Math.abs(r.d) + r.width / 2).toBeLessThanOrEqual(w.halfWidthAt(r.s));
    for (const o of w.obstacles) {
      expect(Math.abs(o.d) + OBSTACLES[o.kind].halfWidth).toBeLessThan(w.halfWidthAt(o.s));
    }
  });

  it('obstacles leave every traffic lane free and do not sit on ramps, gates or bonuses', () => {
    const mix = stage.trafficMix ?? DEFAULT_TRAFFIC_MIX;
    const widest = Math.max(...VEHICLE_KINDS.filter((k) => (mix[k] ?? 0) > 0).map((k) => VEHICLES[k].width));
    const lanes = [...stage.lanes.forward, ...stage.lanes.oncoming];
    for (const o of w.obstacles) {
      const def = OBSTACLES[o.kind];
      for (const lane of lanes) expect(Math.abs(o.d - lane)).toBeGreaterThan(def.halfWidth + widest / 2);
      for (const r of w.ramps) expect(Math.abs(r.s - o.s)).toBeGreaterThan(def.halfLength + 8);
      for (const c of w.rules.checkpoints) expect(Math.abs(c.s - o.s)).toBeGreaterThan(def.halfLength + 5);
      for (const p of w.pickups.filter((x) => x.route < 0))
        expect(Math.abs(p.s - o.s)).toBeGreaterThan(def.halfLength + 3);
      for (const r of w.routes) {
        // Never in front of a shortcut entrance.
        if (Math.sign(o.d) === r.side) expect(o.s < r.entry.from - 10 || o.s > r.entry.to + 10).toBe(true);
      }
    }
  });

  it('every level crossing has a ramp to jump the lowered barriers, on a straight clear of everything else', () => {
    for (const c of w.crossings) {
      const ramp = w.ramps.find((r) => r.s < c.s - BARRIER_OFFSET && r.s > c.s - BARRIER_OFFSET - 10);
      expect(ramp).toBeDefined();
      expect(ramp!.width).toBeGreaterThanOrEqual(hw * 2 - 4);
      for (const r of w.routes) expect(c.s < r.fromS - 40 || c.s > r.toS + 40).toBe(true);
      for (const cp of w.rules.checkpoints) expect(Math.abs(cp.s - c.s)).toBeGreaterThan(40);
      for (let s = c.s - 30; s <= c.s + 30; s += 2) expect(Math.abs(w.track.sample(s).curvature)).toBeLessThan(0.005);
    }
  });

  const strips: [string, River, { from: number; to: number }][] = [
    ...stage.bridges.map(
      (b) =>
        ['river', riverOf(w.track, b), { from: b.from * L, to: b.to * L }] as [
          string,
          River,
          { from: number; to: number },
        ],
    ),
    ...(stage.crossings ?? []).map(
      (c) =>
        ['railway', railOf(w.track, c.at), { from: c.at * L - 5, to: c.at * L + 5 }] as [
          string,
          River,
          { from: number; to: number },
        ],
    ),
  ];
  it.each(strips)(
    'the %s only crosses the main road where intended and never touches a shortcut',
    (_k, strip, span) => {
      for (let s = 0; s < L; s += 2) {
        for (const d of [-edge, 0, edge]) {
          const p = w.track.toWorld(s, d);
          if (inRiver(strip, p.x, p.z)) {
            expect(s).toBeGreaterThan(span.from);
            expect(s).toBeLessThan(span.to);
          }
        }
      }
      for (const r of w.routes) {
        for (let s = 0; s < r.track.length; s += 2) {
          for (const d of [-ROUTE_HALF_WIDTH - 2, 0, ROUTE_HALF_WIDTH + 2]) {
            const p = r.track.toWorld(s, d);
            expect(inRiver(strip, p.x, p.z)).toBe(false);
          }
        }
      }
    },
  );

  it('only enters a park on a bridge', () => {
    for (const park of stage.parks ?? []) {
      for (let s = 0; s < L; s += 2) {
        for (const d of [-edge, 0, edge]) {
          const p = w.track.toWorld(s, d);
          if (inPolygon(park, p.x, p.z)) {
            expect(stage.bridges.some((b) => s > b.from * L && s < b.to * L)).toBe(true);
          }
        }
      }
    }
  });

  it('shortcuts dive to the floor of a sunken riverbed and stay at street level elsewhere', () => {
    const bed = w.riverbed;
    for (const r of w.routes) {
      for (let s = 0; s <= r.track.length; s += 1) {
        const p = r.track.sample(s);
        if (!bed || !r.sunken || s < r.sunken.from || s > r.sunken.to) {
          expect(Math.abs(p.y - w.track.heightAt(r.fromS))).toBeLessThan(0.5);
        } else {
          // Below the streets only inside the bed, and on its floor away from the ramps.
          expect(p.y).toBeLessThanOrEqual(0.01);
          expect(p.y).toBeGreaterThanOrEqual(-bed.depth - 0.01);
          if (p.y < -0.5) expect(bed.sunk(p.x, p.z)).toBe(true);
        }
      }
    }
    if (stage.id === 'valencia') {
      expect(bed?.depth).toBe(5);
      expect(w.routes.filter((r) => r.sunken).length).toBeGreaterThanOrEqual(3);
    }
  });

  it('keeps monuments off the roads (city gates stand over a covered section)', () => {
    for (const m of stage.monuments ?? []) {
      const def = MONUMENTS[m.kind];
      if (def.spansRoad) {
        expect(m.d).toBe(0);
        expect(stage.tunnels.some((t) => m.at > t.from && m.at < t.to)).toBe(true);
        continue;
      }
      const c = w.track.toWorld(m.at * L, m.d);
      for (let s = 0; s < L; s += 2) {
        const p = w.track.sample(s);
        expect(Math.hypot(p.x - c.x, p.z - c.z)).toBeGreaterThan(def.radius + edgeAt(s));
      }
      for (const r of w.routes) {
        for (let s = 0; s < r.track.length; s += 2) {
          const p = r.track.sample(s);
          expect(Math.hypot(p.x - c.x, p.z - c.z)).toBeGreaterThan(def.radius + ROUTE_HALF_WIDTH + 2);
        }
      }
    }
  });

  it('keeps the roads out of the sea, with a beach in between', () => {
    if (!stage.sea) return;
    for (let s = 0; s < L; s += 4) {
      for (const d of [-edge, edge]) {
        const p = w.track.toWorld(s, d);
        expect(polygonDistance(stage.sea, p.x, p.z)).toBeGreaterThan(30);
      }
    }
    for (const r of w.routes) {
      for (let s = 0; s < r.track.length; s += 4) {
        const p = r.track.sample(s);
        expect(polygonDistance(stage.sea, p.x, p.z)).toBeGreaterThan(60);
      }
    }
  });
});

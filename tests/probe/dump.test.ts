import { it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { CHARACTERS } from '../../src/content/characters';
import { MONUMENTS } from '../../src/content/monuments';
import { getStage } from '../../src/content/stages';
import { World } from '../../src/sim/world';
it('dump', () => {
  const st = getStage('valencia');
  const w = new World(st, CHARACTERS[0]!);
  const L = w.track.length;
  const main: number[][] = [];
  for (let s = 0; s <= L; s += 4) { const p = w.track.sample(s); main.push([p.x, p.z, s / L]); }
  const routes = w.routes.map((r) => { const pts: number[][] = []; for (let s = 0; s <= r.track.length; s += 3) { const p = r.track.sample(s); pts.push([p.x, p.z]); } return { kind: r.kind, side: r.side, pts, from: r.fromS / L, to: r.toS / L }; });
  const mons = (st.monuments ?? []).map((m) => { const p = w.track.toWorld(m.at * L, m.d); return { kind: m.kind, x: p.x, z: p.z, r: MONUMENTS[m.kind].radius }; });
  const hw = (w as unknown as { halfWidthAt?: (s: number) => number }).halfWidthAt;
  const widths = hw ? main.map((m) => hw.call(w, m[2]! * L)) : main.map(() => st.roadHalfWidth);
  writeFileSync('/tmp/probe/layout.json', JSON.stringify({ L, main, widths, routes, mons, parks: st.parks ?? [], cp: st.controlPoints }));
  console.log('L', L.toFixed(0));
});

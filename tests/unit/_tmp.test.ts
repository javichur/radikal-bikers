import { writeFileSync } from 'node:fs';
import { it } from 'vitest';
import { STAGES } from '../../src/content/stages';
import { CHARACTERS } from '../../src/content/characters';
import { FIXED_DT } from '../../src/core/loop';
import { World } from '../../src/sim/world';
import { controls } from './helpers';
it('dump', () => {
  const out: string[] = [];
  for (const i of [0, 1]) {
  const w = new World(STAGES[0]!, CHARACTERS[0]!);
  w.traffic.vehicles.length = 0;
  const r = w.routes[i]!;
  w.bike.s = r.entry.from - 12; w.bike.d = r.side * 9; w.bike.speed = 18;
  for (let t = 0; t < 20; t += FIXED_DT) {
    const b = w.bike;
    let c;
    if (b.route < 0 && t < 3) c = controls({ throttle: 0.6, steer: Math.max(-1, Math.min(1, (r.side * 0.35 - b.yaw) * 4)) });
    else if (b.route >= 0) { const dy = Math.max(-0.5, Math.min(0.5, -b.d * 0.2)); c = controls({ throttle: 1, steer: Math.max(-1, Math.min(1, (dy - b.yaw) * 4)) }); }
    else c = controls();
    const ev = w.step(c, FIXED_DT);
    if (ev.length || Math.round(t / FIXED_DT) % 30 === 0) out.push(`${t.toFixed(2)} r${b.route} s${b.s.toFixed(1)} d${b.d.toFixed(2)} yaw${b.yaw.toFixed(2)} v${b.speed.toFixed(1)} h${b.height.toFixed(2)} ${JSON.stringify(ev)}`);
  }
  }
  writeFileSync('/tmp/dump.txt', out.join('\n'));
});

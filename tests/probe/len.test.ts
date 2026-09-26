import { it } from 'vitest';
import { STAGES } from '../../src/content/stages';
import { Track } from '../../src/sim/track';
it('len', () => {
  for (const s of STAGES) console.log(s.id, new Track(s.controlPoints, 1, s.profile).length.toFixed(0));
});

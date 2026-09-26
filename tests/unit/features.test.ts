import { describe, expect, it } from 'vitest';
import { challengeDone, challengeMask, countBits, gradeFor, type RunSummary } from '../../src/content/challenges';
import { CHARACTERS } from '../../src/content/characters';
import { levelFor, levelProgress, MAX_LEVEL, paintUnlocked, PAINTS, xpForLevel } from '../../src/content/progression';
import { STAGES } from '../../src/content/stages';
import {
  addTrick,
  bankCombo,
  breakCombo,
  COMBO_WINDOW,
  comboMultiplier,
  comboValue,
  createCombo,
  stepCombo,
  TRICK_POINTS,
} from '../../src/sim/combo';
import type { SimEvent } from '../../src/sim/events';
import { GhostRecorder, ghostLength, ghostPose, isGhostData } from '../../src/sim/ghost';
import { buildCones, laneClosed, pickWorkZones } from '../../src/sim/roadworks';
import { World } from '../../src/sim/world';
import { autopilot, controls, run } from './helpers';

const summary = (r: Partial<RunSummary> = {}): RunSummary => ({
  finished: true,
  crashes: 0,
  nearMisses: 0,
  maxWheelie: 0,
  shortcuts: 0,
  explosions: 0,
  bestCombo: 0,
  beatRival: false,
  ...r,
});

describe('combo', () => {
  it('raises the multiplier every two tricks up to x5', () => {
    const c = createCombo();
    const ev: SimEvent[] = [];
    const mults: number[] = [];
    for (let i = 0; i < 12; i++) {
      addTrick(c, 'nearMiss', ev);
      mults.push(comboMultiplier(c));
    }
    expect(mults.slice(0, 6)).toEqual([1, 1, 2, 2, 3, 3]);
    expect(Math.max(...mults)).toBe(5);
    expect(comboValue(c)).toBe(12 * TRICK_POINTS.nearMiss * 5);
  });

  it('banks after the combo window and resets', () => {
    const c = createCombo();
    const ev: SimEvent[] = [];
    addTrick(c, 'jump', ev);
    addTrick(c, 'wheelie', ev);
    addTrick(c, 'glass', ev);
    expect(stepCombo(c, COMBO_WINDOW - 0.1, ev)).toBe(0);
    const banked = stepCombo(c, 0.2, ev);
    expect(banked).toBe((TRICK_POINTS.jump + TRICK_POINTS.wheelie + TRICK_POINTS.glass) * 2);
    expect(ev.at(-1)).toEqual({ type: 'comboBanked', points: banked, count: 3 });
    expect(c.count).toBe(0);
    expect(c.best).toBe(3);
    expect(bankCombo(c, ev)).toBe(0);
  });

  it('a new trick refreshes the window; a crash loses the chain', () => {
    const c = createCombo();
    const ev: SimEvent[] = [];
    addTrick(c, 'glass', ev);
    stepCombo(c, COMBO_WINDOW - 0.5, ev);
    addTrick(c, 'glass', ev);
    expect(stepCombo(c, 1, ev)).toBe(0);
    breakCombo(c, ev);
    expect(ev.at(-1)?.type).toBe('comboLost');
    expect(c.count).toBe(0);
    expect(c.bestBank).toBe(0);
  });
});

describe('challenges and grades', () => {
  it('evaluates every challenge kind and needs a delivery', () => {
    expect(challengeDone({ kind: 'noCrash', target: 0 }, summary())).toBe(true);
    expect(challengeDone({ kind: 'noCrash', target: 0 }, summary({ finished: false }))).toBe(false);
    expect(challengeDone({ kind: 'wheelieStreak', target: 2 }, summary({ maxWheelie: 2.1 }))).toBe(true);
    expect(challengeDone({ kind: 'shortcuts', target: 2 }, summary({ shortcuts: 1 }))).toBe(false);
    expect(challengeDone({ kind: 'nearMiss', target: 3 }, summary({ nearMisses: 3 }))).toBe(true);
    expect(challengeDone({ kind: 'combo', target: 6 }, summary({ bestCombo: 5 }))).toBe(false);
    expect(challengeDone({ kind: 'beatRival', target: 0 }, summary({ beatRival: true }))).toBe(true);
    expect(challengeDone({ kind: 'explode', target: 1 }, summary({ explosions: 1 }))).toBe(true);
  });

  it('builds star masks', () => {
    const list = STAGES[0]!.challenges;
    const mask = challengeMask(list, summary({ crashes: 1, shortcuts: 5, maxWheelie: 9 }));
    expect(countBits(mask)).toBe(list.length - 1);
    expect(countBits(0b1011)).toBe(3);
  });

  it('grades scores', () => {
    const g = { s: 300, a: 200, b: 100 };
    expect([gradeFor(350, g), gradeFor(200, g), gradeFor(150, g), gradeFor(10, g)]).toEqual(['S', 'A', 'B', 'C']);
    for (const s of STAGES) expect(s.grades.s > s.grades.a && s.grades.a > s.grades.b).toBe(true);
  });
});

describe('progression', () => {
  it('maps XP to levels and progress', () => {
    expect(levelFor(0)).toBe(1);
    expect(levelFor(xpForLevel(2))).toBe(2);
    expect(levelFor(xpForLevel(3) - 1)).toBe(2);
    expect(levelFor(1e12)).toBe(MAX_LEVEL);
    expect(levelProgress(0)).toBe(0);
    expect(levelProgress((xpForLevel(2) + xpForLevel(3)) / 2)).toBeCloseTo(0.5);
  });

  it('unlocks paints by level', () => {
    expect(paintUnlocked(0, 1)).toBe(true);
    expect(PAINTS.filter((_, i) => paintUnlocked(i, 1))).toHaveLength(1);
    expect(PAINTS.every((_, i) => paintUnlocked(i, MAX_LEVEL))).toBe(true);
    expect(paintUnlocked(PAINTS.length, MAX_LEVEL)).toBe(false);
  });
});

describe('ghost', () => {
  it('records at a fixed rate and interpolates poses', () => {
    const rec = new GhostRecorder();
    for (let t = 0; t <= 2; t += 1 / 60) {
      rec.sample(t, { route: -1, s: t * 10, d: 1, yaw: 0, height: 0, wheelie: 0, lean: 0 });
    }
    rec.split(1.5);
    const g = rec.finish(2);
    expect(isGhostData(g)).toBe(true);
    expect(ghostLength(g)).toBeGreaterThanOrEqual(30);
    expect(ghostPose(g, 1)!.s).toBeCloseTo(10, 0);
    expect(ghostPose(g, 99)!.s).toBeCloseTo(ghostPose(g, 2.5)!.s);
    expect(g.splits).toEqual([1.5]);
  });

  it('rejects malformed data', () => {
    expect(isGhostData(null)).toBe(false);
    expect(isGhostData({ version: 1, time: 1, splits: [], frames: [1, 2, 3] })).toBe(false);
    expect(isGhostData({ version: 2, time: 1, splits: [], frames: [] })).toBe(false);
    expect(isGhostData({ version: 1, time: Number.NaN, splits: [], frames: [] })).toBe(false);
    expect(isGhostData({ version: 1, time: 1, splits: [Infinity], frames: [] })).toBe(false);
    expect(ghostPose({ version: 1, time: 0, splits: [], frames: [] }, 1)).toBeNull();
  });
});

describe('roadworks', () => {
  const night = STAGES.find((s) => s.id === 'harborNight')!;

  it('picks deterministic zones per seed', () => {
    const a = pickWorkZones(night, 2000, 7);
    expect(a).toEqual(pickWorkZones(night, 2000, 7));
    expect(a).toHaveLength(night.roadworksPerRace);
    expect(buildCones(a).length).toBeGreaterThan(a.length * 4);
  });

  it('closes only the marked lane', () => {
    const z = [{ from: 100, to: 200, d: 3 }];
    expect(laneClosed(z, 150, 3)).toBe(true);
    expect(laneClosed(z, 150, -3)).toBe(false);
    expect(laneClosed(z, 90, 3)).toBe(false);
    expect(laneClosed(z, 90, 3, 20)).toBe(true);
  });

  it('keeps traffic out of closed lanes', () => {
    const w = new World(night, CHARACTERS[0]!, 11);
    run(w, 30, controls(), true);
    for (const v of w.traffic.vehicles) {
      const inside = w.zones.some((z) => Math.abs(z.d - v.d) < 0.5 && v.s > z.from + 10 && v.s < z.to);
      expect(inside).toBe(false);
    }
  });

  it('knocks cones over and slows the bike', () => {
    const w = new World(night, CHARACTERS[0]!, 11);
    w.traffic.vehicles.length = 0;
    const cone = w.cones[w.cones.length - 1]!;
    w.bike.s = cone.s - 4;
    w.bike.d = cone.d;
    w.bike.speed = 20;
    const events = run(w, 0.4, controls({ throttle: 1 }));
    expect(events.some((e) => e.type === 'cone')).toBe(true);
    expect(cone.hit).toBe(true);
  });
});

describe('world tricks', () => {
  const stage = STAGES[0]!;

  it('rewards a near miss with a trick', () => {
    const w = new World(stage, CHARACTERS[0]!);
    w.traffic.vehicles.length = 0;
    w.traffic.vehicles.push({
      id: 50,
      kind: 'car',
      s: 80,
      d: 3 + 2.2,
      dir: 1,
      speed: 0,
      cruiseSpeed: 0,
      length: 4.2,
      width: 1.8,
      height: 1.5,
      honkCooldown: 99,
      variant: 0,
    });
    w.bike.s = 60;
    w.bike.d = 3;
    w.bike.speed = 25;
    const events = run(w, 1.5, controls({ throttle: 1 }));
    expect(events.some((e) => e.type === 'nearMiss')).toBe(true);
    expect(events.some((e) => e.type === 'trick' && e.kind === 'nearMiss')).toBe(true);
    expect(w.stats.nearMisses).toBe(1);
  });

  it('races a rival that finishes the stage', () => {
    const w = new World(stage, CHARACTERS[0]!);
    expect(w.rival).not.toBeNull();
    const events = run(w, 150, (x) => autopilot(x, 3));
    expect(w.race.finished).toBe(true);
    expect(w.rival!.bike.s).toBeGreaterThan(w.track.length * 0.8);
    expect(events.some((e) => e.type === 'rivalPassed')).toBe(true);
    const s = w.summary();
    expect(s.beatRival).toBe(w.beatRival);
  });

  it('the night stage is completable', () => {
    const night = STAGES.find((s) => s.id === 'harborNight')!;
    const w = new World(night, CHARACTERS[0]!);
    run(w, 150, (x) => autopilot(x, 3));
    expect(w.race.finished).toBe(true);
  });
});

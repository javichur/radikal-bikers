import { describe, expect, it } from 'vitest';
import type { SimEvent } from '../../src/sim/events';
import { computeScore, continueRace, createRace, HURRY_UP_SECONDS, stepRace, type RaceRules } from '../../src/sim/race';

const rules: RaceRules = {
  startTime: 30,
  checkpoints: [
    { s: 100, bonus: 20 },
    { s: 200, bonus: 10 },
  ],
  finishS: 300,
};

describe('race rules', () => {
  it('counts down the clock', () => {
    const r = createRace(rules);
    stepRace(r, rules, 0, 1, []);
    expect(r.timeLeft).toBe(29);
    expect(r.elapsed).toBe(1);
  });

  it('awards extended time at checkpoints, once each, in order', () => {
    const r = createRace(rules);
    const ev: SimEvent[] = [];
    stepRace(r, rules, 250, 0, ev);
    expect(ev.filter((e) => e.type === 'checkpoint')).toHaveLength(2);
    expect(r.timeLeft).toBe(60);
    expect(r.lastCheckpointS).toBe(200);
    stepRace(r, rules, 260, 0, ev);
    expect(ev.filter((e) => e.type === 'checkpoint')).toHaveLength(2);
  });

  it('warns to hurry up once, and reports time up', () => {
    const r = createRace(rules);
    const ev: SimEvent[] = [];
    stepRace(r, rules, 0, 30 - HURRY_UP_SECONDS + 0.1, ev);
    stepRace(r, rules, 0, 1, ev);
    expect(ev.filter((e) => e.type === 'hurryUp')).toHaveLength(1);
    stepRace(r, rules, 0, 20, ev);
    expect(r.timeUp).toBe(true);
    expect(ev.at(-1)).toEqual({ type: 'timeUp' });
    const n = ev.length;
    stepRace(r, rules, 500, 1, ev);
    expect(ev.length).toBe(n);
  });

  it('finishes when crossing the line', () => {
    const r = createRace(rules);
    const ev: SimEvent[] = [];
    stepRace(r, rules, 301, 0.1, ev);
    expect(r.finished).toBe(true);
    expect(ev.at(-1)).toEqual({ type: 'finish' });
  });

  it('continue restores a full clock and is penalised in the score', () => {
    const r = createRace(rules);
    stepRace(r, rules, 0, 100, []);
    expect(r.timeUp).toBe(true);
    continueRace(r, rules);
    expect(r.timeUp).toBe(false);
    expect(r.timeLeft).toBe(30);
    expect(computeScore(r, 1000)).toBe(10000 - 5000);
  });

  it('adds a time bonus when finished', () => {
    const r = createRace(rules);
    stepRace(r, rules, 301, 1, []);
    // 30 - 1 s elapsed + 20 + 10 checkpoint bonuses = 59 s left.
    expect(computeScore(r, 301)).toBe(3010 + 59000);
  });
});

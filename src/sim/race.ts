import type { StageDef } from '../content/stages';
import type { SimEvent } from './events';

export const HURRY_UP_SECONDS = 10;
export const FINISH_MARGIN = 15;

export interface RaceState {
  timeLeft: number;
  elapsed: number;
  /** Index of the next checkpoint to reach. */
  nextCheckpoint: number;
  /** Distance of the last checkpoint passed (continue point). */
  lastCheckpointS: number;
  finished: boolean;
  timeUp: boolean;
  hurryWarned: boolean;
  continues: number;
}

export interface RaceRules {
  readonly startTime: number;
  readonly checkpoints: readonly { readonly s: number; readonly bonus: number }[];
  readonly finishS: number;
}

export const rulesFromStage = (stage: StageDef, trackLength: number): RaceRules => ({
  startTime: stage.startTime,
  checkpoints: stage.checkpoints.map((c) => ({ s: c.at * trackLength, bonus: c.bonus })),
  finishS: trackLength - FINISH_MARGIN,
});

export const createRace = (rules: RaceRules): RaceState => ({
  timeLeft: rules.startTime,
  elapsed: 0,
  nextCheckpoint: 0,
  lastCheckpointS: 0,
  finished: false,
  timeUp: false,
  hurryWarned: false,
  continues: 0,
});

export const stepRace = (r: RaceState, rules: RaceRules, playerS: number, dt: number, events: SimEvent[]): void => {
  if (r.finished || r.timeUp) return;
  r.elapsed += dt;
  r.timeLeft = Math.max(0, r.timeLeft - dt);

  while (r.nextCheckpoint < rules.checkpoints.length) {
    const cp = rules.checkpoints[r.nextCheckpoint]!;
    if (playerS < cp.s) break;
    r.timeLeft += cp.bonus;
    r.lastCheckpointS = cp.s;
    r.hurryWarned = false;
    events.push({ type: 'checkpoint', index: r.nextCheckpoint, bonus: cp.bonus });
    r.nextCheckpoint++;
  }

  if (playerS >= rules.finishS) {
    r.finished = true;
    events.push({ type: 'finish' });
    return;
  }
  if (!r.hurryWarned && r.timeLeft <= HURRY_UP_SECONDS) {
    r.hurryWarned = true;
    events.push({ type: 'hurryUp' });
  }
  if (r.timeLeft <= 0) {
    r.timeUp = true;
    events.push({ type: 'timeUp' });
  }
};

/** Arcade "continue": fresh clock, restart from the last checkpoint. */
export const continueRace = (r: RaceState, rules: RaceRules): void => {
  r.timeUp = false;
  r.hurryWarned = false;
  r.timeLeft = rules.startTime;
  r.continues++;
};

/** Score: distance + time bonus; continues are penalised like the arcade. */
export const computeScore = (r: RaceState, playerS: number): number => {
  const distance = Math.floor(playerS) * 10;
  const timeBonus = r.finished ? Math.floor(r.timeLeft * 1000) : 0;
  const penalty = r.continues * 5000;
  return Math.max(0, distance + timeBonus - penalty);
};

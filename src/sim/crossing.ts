/** Level crossing: a railway cutting the main road, with barriers and a train on a fixed, deterministic timetable. */

/** Seconds between the bells starting (barriers down) and the train setting off towards the road. */
export const CROSSING_WARN = 3;
/** Train speed (m/s), length (m) and the distance from the road where it appears / disappears. */
export const TRAIN_SPEED = 30;
export const TRAIN_LENGTH = 60;
export const TRAIN_APPROACH = 160;
/** Seconds the barriers stay down on every cycle. */
export const CROSSING_CLOSED = CROSSING_WARN + (2 * TRAIN_APPROACH) / TRAIN_SPEED;
/** Distance of each barrier from the railway, along the road. */
export const BARRIER_OFFSET = 4;
export const BARRIER_HEIGHT = 1;
/** Half the width of the railway (and train) along the road, and the train height. */
export const RAIL_HALF_WIDTH = 1.8;
export const TRAIN_HEIGHT = 4.2;

export interface CrossingState {
  /** Barriers down. */
  readonly closed: boolean;
  /** Barrier arm position: 0 = up, 1 = down. */
  readonly arm: number;
  /** Position of the front of the train across the road (0 = road centre), or null when there is no train. */
  readonly trainHead: number | null;
}

const ARM_TIME = 1;

/**
 * State of a crossing at simulation time `time`.
 * @param period seconds between trains; @param offset shifts the timetable.
 */
export const crossingState = (period: number, offset: number, time: number): CrossingState => {
  const phase = (((time + offset) % period) + period) % period;
  const closed = phase < CROSSING_CLOSED;
  const arm = closed ? Math.min(1, phase / ARM_TIME) : Math.max(0, 1 - (phase - CROSSING_CLOSED) / ARM_TIME);
  const running = phase >= CROSSING_WARN && closed;
  return {
    closed,
    arm,
    trainHead: running ? -TRAIN_APPROACH + (phase - CROSSING_WARN) * TRAIN_SPEED : null,
  };
};

/** Whether any part of the train is across a road of half width `halfWidth`. */
export const trainOnRoad = (s: CrossingState, halfWidth: number): boolean =>
  s.trainHead !== null && s.trainHead > -halfWidth - 1 && s.trainHead - TRAIN_LENGTH < halfWidth + 1;

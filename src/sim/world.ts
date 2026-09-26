import { Rng } from '../core/rng';
import type { CharacterDef } from '../content/characters';
import type { StageDef } from '../content/stages';
import type { ControlState } from '../input/types';
import { BIKE, crashBike, createBike, launchBike, stepBike, type BikeState } from './bike';
import type { SimEvent } from './events';
import {
  computeScore,
  continueRace,
  createRace,
  rulesFromStage,
  stepRace,
  type RaceRules,
  type RaceState,
} from './race';
import { Track } from './track';
import { overlaps, Traffic, type Vehicle } from './traffic';

export interface Ramp {
  readonly s: number;
  readonly d: number;
  readonly width: number;
}

const BUMP_SPEED = 4;

/** The whole deterministic game simulation for one race. */
export class World {
  readonly track: Track;
  readonly rules: RaceRules;
  readonly ramps: readonly Ramp[];
  readonly traffic: Traffic;
  bike: BikeState;
  race: RaceState;

  constructor(
    readonly stage: StageDef,
    readonly character: CharacterDef,
    seed = stage.seed,
  ) {
    this.track = new Track(stage.controlPoints);
    this.rules = rulesFromStage(stage, this.track.length);
    this.ramps = stage.ramps.map((r) => ({ s: r.at * this.track.length, d: r.d, width: r.width }));
    this.bike = createBike(5, stage.lanes.forward[0] ?? 0);
    this.race = createRace(this.rules);
    this.traffic = new Traffic(
      {
        trackLength: this.track.length,
        forwardLanes: stage.lanes.forward,
        oncomingLanes: stage.lanes.oncoming,
        density: stage.trafficDensity,
      },
      new Rng(seed),
    );
    this.traffic.populate(this.bike.s);
  }

  /**
   * Advances the world one fixed step.
   * @param raceRunning false during the start countdown (clock frozen, bike held).
   */
  step(input: ControlState, dt: number, raceRunning = true): SimEvent[] {
    const events: SimEvent[] = [];
    const b = this.bike;
    const prevS = b.s;
    const finished = this.race.finished || this.race.timeUp;
    const controls: ControlState =
      raceRunning && !finished ? input : { steer: 0, throttle: 0, brake: finished ? 1 : 0, wheelie: false };

    stepBike(
      b,
      controls,
      this.character.stats,
      {
        curvature: this.track.sample(b.s).curvature,
        roadHalfWidth: this.stage.roadHalfWidth,
      },
      dt,
      events,
    );

    for (const r of this.ramps) {
      if (prevS < r.s && b.s >= r.s && Math.abs(b.d - r.d) < r.width / 2) launchBike(b, events);
    }

    this.traffic.update(b.s, b.d, b.speed, dt, events);
    this.resolveTrafficCollisions(events);
    if (events.some((e) => e.type === 'respawn')) this.placeSafely();

    if (raceRunning) stepRace(this.race, this.rules, b.s, dt, events);
    return events;
  }

  private resolveTrafficCollisions(events: SimEvent[]): void {
    const b = this.bike;
    if (b.crashTimer > 0 || b.invulnerable > 0) return;
    const bikeBox = { s: b.s, d: b.d, halfLength: BIKE.length / 2, halfWidth: BIKE.width / 2 };
    for (const v of this.traffic.vehicles) {
      if (b.height > v.height) continue; // jumped over it!
      const vBox = { s: v.s, d: v.d, halfLength: v.length / 2, halfWidth: v.width / 2 };
      if (!overlaps(bikeBox, vBox)) continue;
      const penS = bikeBox.halfLength + vBox.halfLength - Math.abs(b.s - v.s);
      const penD = bikeBox.halfWidth + vBox.halfWidth - Math.abs(b.d - v.d);
      const sideS = Math.sign(v.s - b.s) || 1;
      const sideD = Math.sign(b.d - v.d) || 1;
      if (penD < penS) {
        // Side swipe: bounce off sideways, crash only if slamming into it.
        const lateral = -b.speed * Math.sin(b.yaw) * sideD;
        if (lateral > BIKE.wallCrashLateralSpeed) {
          crashBike(b, 'vehicle', events);
          return;
        }
        b.d = v.d + sideD * (vBox.halfWidth + bikeBox.halfWidth + 0.05);
        if (lateral > 0) b.yaw *= -0.3;
        b.speed *= 0.97;
        events.push({ type: 'scrape' });
        continue;
      }
      const closing = (b.speed * Math.cos(b.yaw) - v.speed * v.dir) * sideS;
      if (closing > BUMP_SPEED) {
        crashBike(b, 'vehicle', events);
        return;
      }
      // Gentle rear-end nudge: match speed and back off.
      b.speed = Math.max(0, v.speed * v.dir);
      b.s = v.s - sideS * (vBox.halfLength + bikeBox.halfLength + 0.05);
      events.push({ type: 'scrape' });
    }
  }

  /** After a crash, drop the rider on a lane that's free of traffic. */
  private placeSafely(): void {
    const b = this.bike;
    const lanes = [...this.stage.lanes.forward, ...this.stage.lanes.oncoming];
    const isFree = (d: number): boolean =>
      !this.traffic.vehicles.some((v: Vehicle) => Math.abs(v.d - d) < 2.5 && Math.abs(v.s - b.s) < 25);
    const byDistance = [...lanes].sort((x, y) => Math.abs(x - b.d) - Math.abs(y - b.d));
    b.d = byDistance.find(isFree) ?? byDistance[0] ?? 0;
  }

  continueFromCheckpoint(): void {
    continueRace(this.race, this.rules);
    const b = createBike(this.race.lastCheckpointS + 1, this.stage.lanes.forward[0] ?? 0);
    b.crashes = this.bike.crashes;
    b.invulnerable = BIKE.invulnerableDuration;
    this.bike = b;
    this.traffic.vehicles.length = 0;
    this.traffic.populate(b.s);
  }

  get progress(): number {
    return Math.min(1, this.bike.s / this.rules.finishS);
  }

  get score(): number {
    return computeScore(this.race, this.bike.s);
  }
}

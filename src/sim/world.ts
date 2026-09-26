import { Rng } from '../core/rng';
import type { RunSummary } from '../content/challenges';
import { CHARACTERS, type CharacterDef } from '../content/characters';
import { OBSTACLES, type ObstacleKind } from '../content/obstacles';
import type { StageDef } from '../content/stages';
import { VEHICLES } from '../content/vehicles';
import type { ControlState } from '../input/types';
import { wrapAngle } from '../core/math';
import { BIKE, canHop, crashBike, hopBike, createBike, landBike, launchBike, stepBike, type BikeState } from './bike';
import {
  BARRIER_HEIGHT,
  BARRIER_OFFSET,
  crossingState,
  RAIL_HALF_WIDTH,
  TRAIN_HEIGHT,
  trainOnRoad,
  type CrossingState,
} from './crossing';
import { addTrick, bankCombo, breakCombo, createCombo, stepCombo, TRICK_POINTS, type ComboState } from './combo';
import type { PickupKind, SimEvent } from './events';
import { GhostRecorder } from './ghost';
import {
  computeScore,
  continueRace,
  createRace,
  rulesFromStage,
  stepRace,
  type RaceRules,
  type RaceState,
} from './race';
import { createRival, stepRival, type RivalState } from './rival';
import { buildCones, CONE_RADIUS, laneClosed, pickWorkZones, type Cone, type WorkZone } from './roadworks';
import { halfWidthAt, laneFits, narrowClosures, narrowsOf, reachesNarrow, type Narrow } from './roadWidth';
import { buildRoute, ROUTE_HALF_WIDTH, routeToMainS, type Route } from './shortcuts';
import { Track } from './track';
import { overlaps, Traffic, TRAFFIC_AHEAD, type Box, type Vehicle } from './traffic';

export interface Ramp {
  readonly s: number;
  readonly d: number;
  readonly width: number;
}

/** Bonus box (explosives or turbo). */
export interface Pickup {
  readonly kind: PickupKind;
  /** -1 = main road, otherwise shortcut index. */
  readonly route: number;
  readonly s: number;
  readonly d: number;
  /** Seconds until it reappears after being collected (0 = available). */
  respawn: number;
}

/** Fixed obstacle on the main road. */
export interface ObstacleState {
  readonly kind: ObstacleKind;
  readonly s: number;
  readonly d: number;
  /** Knocked over (cones) or smashed by the explosive bonus (fences). */
  knocked: boolean;
}

/** Level crossing on the main road. */
export interface Crossing {
  readonly s: number;
  readonly period: number;
  readonly offset: number;
}

const BUMP_SPEED = 4;
/** Speed kept after ploughing through a line of cones. */
const CONES_SPEED_KEEP = 0.8;
/** Distance within which the crossing bells are heard. */
const BELL_DISTANCE = 400;
export const PICKUP_RADIUS = 1.6;
export const PICKUP_RESPAWN = 25;
/** Base points for every vehicle blown up (before the combo multiplier). */
export const EXPLODE_POINTS = TRICK_POINTS.explode;
/** Base points for collecting a turbo box (before the combo multiplier). */
export const TURBO_POINTS = TRICK_POINTS.turbo;
/** Bonus for delivering before the rival. */
export const RIVAL_POINTS = 5000;
/** Lateral clearance (m) under which passing a vehicle counts as a near miss. */
export const NEAR_MISS_GAP = 1.1;
/** Minimum speed difference with the vehicle for a near miss. */
const NEAR_MISS_REL_SPEED = 8;
const NEAR_MISS_MIN_SPEED = 12;
/** Minimum wheelie / airtime (s) that counts as a trick. */
const WHEELIE_TRICK_TIME = 1;
const AIR_TRICK_TIME = 0.4;
/** Speed kept after knocking a cone over. */
const CONE_SPEED_KEEP = 0.9;

/** Run statistics used by challenges, the career profile and the results screen. */
export interface RunStats {
  nearMisses: number;
  /** Longest single wheelie, seconds. */
  maxWheelie: number;
  /** Longest airtime, seconds. */
  maxAirtime: number;
  readonly shortcuts: Set<number>;
  explosions: number;
  glass: number;
  cones: number;
}
/** Speed kept after smashing through a shop window. */
const GLASS_SPEED_KEEP = 0.85;

/** The whole deterministic game simulation for one race. */
export class World {
  readonly track: Track;
  readonly rules: RaceRules;
  readonly ramps: readonly Ramp[];
  readonly traffic: Traffic;
  readonly routes: readonly Route[];
  readonly pickups: readonly Pickup[];
  readonly obstacles: readonly ObstacleState[];
  readonly crossings: readonly Crossing[];
  readonly zones: readonly WorkZone[];
  /** Narrow streets of the main road. */
  readonly narrows: readonly Narrow[];
  /** Lanes closed to traffic: roadworks plus the outer lanes of narrow streets. */
  readonly closures: readonly WorkZone[];
  readonly cones: readonly Cone[];
  readonly rival: RivalState | null;
  bike: BikeState;
  race: RaceState;
  readonly combo: ComboState = createCombo();
  readonly stats: RunStats = {
    nearMisses: 0,
    maxWheelie: 0,
    maxAirtime: 0,
    shortcuts: new Set(),
    explosions: 0,
    glass: 0,
    cones: 0,
  };
  /** Records this run so it can become the ghost to beat. */
  readonly recorder = new GhostRecorder();
  beatRival = false;
  private readonly nearMissed = new Set<number>();
  private readonly touched = new Set<number>();
  private wheelieRun = 0;
  private airtime = 0;
  /** Simulation clock (also runs during the countdown): drives the train timetable. */
  time = 0;
  /** Vertical speed of the road under the grounded bike (detects crests). */
  private roadVy = 0;

  constructor(
    readonly stage: StageDef,
    readonly character: CharacterDef,
    seed = stage.seed,
  ) {
    this.track = new Track(stage.controlPoints, 1, stage.profile);
    this.rules = rulesFromStage(stage, this.track.length);
    this.ramps = stage.ramps.map((r) => ({ s: r.at * this.track.length, d: r.d, width: r.width }));
    this.narrows = narrowsOf(stage, this.track.length);
    this.routes = stage.shortcuts.map((def, i) => buildRoute(this.track, (s) => this.halfWidthAt(s), def, i));
    this.pickups = stage.pickups.map((p) => ({
      kind: p.kind ?? 'explosive',
      route: p.route,
      s: p.at * this.trackOf(p.route).length,
      d: p.d,
      respawn: 0,
    }));
    this.obstacles = (stage.obstacles ?? []).map((o) => ({
      kind: o.kind,
      s: o.at * this.track.length,
      d: o.d,
      knocked: false,
    }));
    this.crossings = (stage.crossings ?? []).map((c) => ({
      s: c.at * this.track.length,
      period: c.period,
      offset: c.offset,
    }));
    this.zones = pickWorkZones(stage, this.track.length, seed);
    this.closures = [...this.zones, ...narrowClosures(this.narrows, [...stage.lanes.forward, ...stage.lanes.oncoming])];
    this.cones = buildCones(this.zones);
    this.bike = createBike(5, stage.lanes.forward[0] ?? 0);
    this.race = createRace(this.rules);
    const rival = stage.rival
      ? (CHARACTERS.find((c) => c.id === stage.rival && c.id !== character.id) ??
        CHARACTERS.find((c) => c.id !== character.id))
      : undefined;
    this.rival = rival ? createRival(rival, stage) : null;
    this.traffic = new Traffic(
      {
        trackLength: this.track.length,
        forwardLanes: stage.lanes.forward,
        oncomingLanes: stage.lanes.oncoming,
        density: stage.trafficDensity,
        mix: stage.trafficMix,
        oncomingSpeedScale: stage.oncomingSpeedScale,
        laneClosed: (s, d, margin) => laneClosed(this.closures, s, d, margin),
        lightOnly: this.narrows.length ? (s, dir) => reachesNarrow(this.narrows, s, dir, TRAFFIC_AHEAD) : undefined,
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
    const wasClosed = this.crossings.map((_, i) => this.crossingAt(i).closed);
    this.time += dt;
    const finished = this.race.finished || this.race.timeUp;
    const controls: ControlState =
      raceRunning && !finished ? input : { steer: 0, throttle: 0, brake: finished ? 1 : 0, wheelie: false };

    const track = this.currentTrack;
    const here = track.sample(b.s);
    const prevY = here.y;
    // Road vertical speed used by stepBike for an airborne bike (not while tumbling after a crash).
    const ahead = b.speed * Math.cos(b.yaw);
    const airRoadVy = b.airborne && b.crashTimer <= 0 ? ahead * track.sample(b.s + ahead * dt).slope : 0;
    stepBike(
      b,
      controls,
      this.character.stats,
      {
        curvature: here.curvature,
        roadHalfWidth: this.roadHalfWidth,
        slope: here.slope,
        openSide: this.openSideAt(b.s),
        roadVy: airRoadVy,
      },
      dt,
      events,
    );
    this.followRoad(track, prevY, airRoadVy, dt, events);

    if (b.route < 0) {
      for (const r of this.ramps) {
        if (prevS < r.s && b.s >= r.s && Math.abs(b.d - r.d) < r.width / 2) {
          launchBike(b, events);
          if (b.airborne) b.vy += Math.max(0, this.roadVy);
        }
      }
    }
    this.updateRoutes(prevS, events);
    this.updatePickups(dt, events);

    const onMain = b.route < 0;
    const states = this.crossings.map((_, i) => this.crossingAt(i));
    states.forEach((st, i) => {
      const c = this.crossings[i]!;
      if (st.closed && !wasClosed[i] && Math.abs(c.s - this.mainS) < BELL_DISTANCE) {
        events.push({ type: 'crossingBell', index: i });
      }
    });
    const closedS = this.crossings.filter((_, i) => states[i]!.closed).map((c) => c.s);
    this.traffic.update(this.mainS, onMain ? b.d : Infinity, b.speed, dt, events, closedS);
    if (onMain) {
      this.resolveTrafficCollisions(events);
      this.resolveObstacles(events);
      this.resolveCrossings(states, events);
      this.detectNearMisses(events);
      this.hitCones(events);
    }
    if (events.some((e) => e.type === 'respawn')) this.placeSafely();
    if (this.rival) {
      stepRival(
        this.rival,
        {
          track: this.track,
          stage: this.stage,
          ramps: this.ramps,
          vehicles: this.traffic.vehicles,
          zones: this.closures,
          roadHalfWidth: (s) => this.halfWidthAt(s),
          finishS: this.rules.finishS,
          playerS: this.mainS,
          elapsed: this.race.elapsed,
        },
        raceRunning && !finished,
        dt,
        events,
      );
    }

    if (raceRunning && !finished) {
      this.scoreTricks(events, dt);
      stepRace(this.race, this.rules, this.mainS, dt, events);
      this.race.bonusPoints += stepCombo(this.combo, dt, events);
      this.recorder.sample(this.race.elapsed, b);
      for (const e of events) {
        if (e.type === 'checkpoint') this.recorder.split(this.race.elapsed);
        else if (e.type === 'timeUp') this.race.bonusPoints += bankCombo(this.combo, events);
        else if (e.type === 'finish') {
          this.race.bonusPoints += bankCombo(this.combo, events);
          this.beatRival = !!this.rival && !this.rival.finished;
          if (this.beatRival) this.race.bonusPoints += RIVAL_POINTS;
        }
      }
    }
    return events;
  }

  /** Turns risky riding into combo points; a crash loses the pending combo. */
  private scoreTricks(events: SimEvent[], dt: number): void {
    const b = this.bike;
    const c = this.combo;
    const n = events.length;
    for (let i = 0; i < n; i++) {
      const e = events[i]!;
      switch (e.type) {
        case 'crash':
          this.wheelieRun = 0;
          this.airtime = 0;
          breakCombo(c, events);
          break;
        case 'nearMiss':
          this.stats.nearMisses++;
          addTrick(c, 'nearMiss', events);
          break;
        case 'glass':
          this.stats.glass++;
          addTrick(c, 'glass', events);
          break;
        case 'shortcut':
          this.stats.shortcuts.add(e.route);
          addTrick(c, 'shortcut', events);
          break;
        case 'explode':
          this.stats.explosions++;
          addTrick(c, 'explode', events);
          break;
        case 'pickup':
          if (e.kind === 'turbo') addTrick(c, 'turbo', events);
          break;
        case 'jump':
          this.airtime = 0;
          break;
        case 'land':
          if (b.crashTimer <= 0 && this.airtime >= AIR_TRICK_TIME) addTrick(c, 'jump', events, 1 + this.airtime);
          this.stats.maxAirtime = Math.max(this.stats.maxAirtime, this.airtime);
          this.airtime = 0;
          break;
        default:
          break;
      }
    }
    if (b.airborne) this.airtime += dt;
    if (b.wheelie > 0.5 && b.crashTimer <= 0) {
      this.wheelieRun += dt;
      this.stats.maxWheelie = Math.max(this.stats.maxWheelie, this.wheelieRun);
    } else {
      if (this.wheelieRun >= WHEELIE_TRICK_TIME) addTrick(c, 'wheelie', events, this.wheelieRun);
      this.wheelieRun = 0;
    }
  }

  /** Passing a vehicle by a hair (without touching it) at a decent speed. */
  private detectNearMisses(events: SimEvent[]): void {
    const b = this.bike;
    if (b.crashTimer > 0 || b.speed < NEAR_MISS_MIN_SPEED) return;
    for (const v of this.traffic.vehicles) {
      if (this.nearMissed.has(v.id) || this.touched.has(v.id)) continue;
      if (Math.abs(b.s - v.s) > v.length / 2 + BIKE.length / 2) continue;
      const gap = Math.abs(b.d - v.d) - (v.width + BIKE.width) / 2;
      if (gap < 0 || gap > NEAR_MISS_GAP) continue;
      if (Math.abs(b.speed - v.speed * v.dir) < NEAR_MISS_REL_SPEED) continue;
      this.nearMissed.add(v.id);
      events.push({ type: 'nearMiss', vehicleId: v.id });
    }
  }

  /** Roadworks cones get knocked over and slow the rider a little. */
  private hitCones(events: SimEvent[]): void {
    const b = this.bike;
    if (b.crashTimer > 0 || b.height > 0.8) return;
    for (let i = 0; i < this.cones.length; i++) {
      const c = this.cones[i]!;
      if (c.hit || Math.abs(b.s - c.s) > BIKE.length / 2 + CONE_RADIUS) continue;
      if (Math.abs(b.d - c.d) > BIKE.width / 2 + CONE_RADIUS) continue;
      c.hit = true;
      this.stats.cones++;
      if (b.explosive <= 0 && b.turbo <= 0) b.speed *= CONE_SPEED_KEEP;
      events.push({ type: 'cone', index: i });
    }
  }

  /** Summary of the run for challenges and the career profile. */
  summary(): RunSummary {
    return {
      finished: this.race.finished,
      crashes: this.bike.crashes,
      nearMisses: this.stats.nearMisses,
      maxWheelie: this.stats.maxWheelie,
      shortcuts: this.stats.shortcuts.size,
      explosions: this.stats.explosions,
      bestCombo: this.combo.best,
      beatRival: this.beatRival,
    };
  }

  /** Track the bike is currently riding on. */
  get currentTrack(): Track {
    return this.trackOf(this.bike.route);
  }

  trackOf(route: number): Track {
    return route < 0 ? this.track : this.routes[route]!.track;
  }

  private get roadHalfWidth(): number {
    return this.bike.route < 0 ? this.halfWidthAt(this.bike.s) : ROUTE_HALF_WIDTH;
  }

  /** Half width of the main carriageway at distance `s` (narrower in narrow streets). */
  halfWidthAt(s: number): number {
    return halfWidthAt(this.stage.roadHalfWidth, this.narrows, s);
  }

  /** Main-road distance equivalent to the bike position (race progress, checkpoints, traffic window). */
  get mainS(): number {
    const b = this.bike;
    return b.route < 0 ? b.s : routeToMainS(this.routes[b.route]!, b.s);
  }

  private openSideAt(s: number): number {
    if (this.bike.route >= 0) return 0;
    for (const r of this.routes) if (s >= r.entry.from && s <= r.entry.to) return r.side;
    return 0;
  }

  /** Hills: the road rising or falling under an airborne bike, and take-off over sharp crests. */
  private followRoad(track: Track, prevY: number, predictedVy: number, dt: number, events: SimEvent[]): void {
    const b = this.bike;
    const p = track.sample(b.s);
    if (b.airborne) {
      // stepBike already accounted for the road moving at `predictedVy`; correct for the actual rise or fall.
      b.height -= p.y - prevY - predictedVy * dt;
      if (b.height <= 0) {
        if (b.crashTimer > 0) {
          b.height = 0;
          b.vy = 0;
          b.airborne = false;
        } else landBike(b, events);
      }
      this.roadVy = 0;
      return;
    }
    const vy = b.speed * Math.cos(b.yaw) * p.slope;
    // The road drops away faster than gravity can pull the bike down: it takes off.
    if (b.crashTimer <= 0 && b.speed > 5 && (vy - this.roadVy) / dt < -BIKE.gravity) {
      b.airborne = true;
      b.vy = this.roadVy;
      b.height = 0.001;
      events.push({ type: 'jump' });
    }
    this.roadVy = b.airborne ? 0 : vy;
  }

  /** Switches the bike between the main road and shortcuts, and smashes shop windows. */
  private updateRoutes(prevS: number, events: SimEvent[]): void {
    const b = this.bike;
    if (b.route < 0) {
      const limit = this.halfWidthAt(b.s) - BIKE.wallMargin;
      const r = this.routes.find((x) => b.s >= x.entry.from && b.s <= x.entry.to && x.side * b.d > limit);
      if (!r) return;
      const w = this.track.toWorld(b.s, b.d);
      const p = r.track.project(w.x, w.z, 0, r.track.length / 2);
      this.moveTo(r.index, r.track, p.s, p.d, w.heading);
      events.push({ type: 'shortcut', route: r.index });
      return;
    }
    const r = this.routes[b.route]!;
    for (let i = 0; i < r.panes.length; i++) {
      const pane = r.panes[i]!;
      if (pane.broken || (prevS - pane.s) * (b.s - pane.s) > 0) continue;
      pane.broken = true;
      b.speed *= GLASS_SPEED_KEEP;
      events.push({ type: 'glass', route: r.index, pane: i });
    }
    const L = r.track.length;
    const nearEnds = b.s < 30 || b.s > L - 30;
    if (!nearEnds) return;
    const w = r.track.toWorld(b.s, b.d);
    const p = this.track.project(w.x, w.z, this.mainS, 90);
    const inside = r.side * p.d < this.halfWidthAt(p.s) - 1;
    if (inside || b.s >= L || b.s <= 0) this.moveTo(-1, this.track, p.s, p.d, w.heading);
  }

  private moveTo(route: number, track: Track, s: number, d: number, oldHeading: number): void {
    const b = this.bike;
    const h = track.sample(s).heading;
    const hw = (route < 0 ? this.halfWidthAt(s) : ROUTE_HALF_WIDTH) - BIKE.wallMargin;
    b.route = route;
    b.s = s;
    b.d = Math.max(-hw, Math.min(hw, d));
    b.yaw = Math.max(-BIKE.maxYaw, Math.min(BIKE.maxYaw, b.yaw + wrapAngle(h - oldHeading)));
  }

  private updatePickups(dt: number, events: SimEvent[]): void {
    const b = this.bike;
    for (const p of this.pickups) {
      if (p.respawn > 0) {
        p.respawn = Math.max(0, p.respawn - dt);
        continue;
      }
      if (p.route !== b.route || b.crashTimer > 0 || b.height > 1.5) continue;
      if (Math.hypot(b.s - p.s, b.d - p.d) > PICKUP_RADIUS) continue;
      p.respawn = PICKUP_RESPAWN;
      if (p.kind === 'turbo') b.turbo = BIKE.turboDuration;
      else b.explosive = BIKE.explosiveDuration;
      events.push({ type: 'pickup', kind: p.kind });
    }
  }

  private get bikeBox(): Box {
    const b = this.bike;
    return { s: b.s, d: b.d, halfLength: BIKE.length / 2, halfWidth: BIKE.width / 2 };
  }

  /**
   * Rigid contact with a box on the main road moving at `speed` (along the road): side swipes bounce the rider off,
   * slow rear-end contacts push him back, anything harder knocks him down. Returns true when the rider went down.
   */
  private bump(o: Box, speed: number, cause: 'vehicle' | 'obstacle', events: SimEvent[]): boolean {
    const b = this.bike;
    const bikeBox = this.bikeBox;
    const penS = bikeBox.halfLength + o.halfLength - Math.abs(b.s - o.s);
    const penD = bikeBox.halfWidth + o.halfWidth - Math.abs(b.d - o.d);
    const sideS = Math.sign(o.s - b.s) || 1;
    const sideD = Math.sign(b.d - o.d) || 1;
    if (penD < penS) {
      // Side swipe: bounce off sideways, crash only if slamming into it.
      const lateral = -b.speed * Math.sin(b.yaw) * sideD;
      if (lateral > BIKE.wallCrashLateralSpeed) {
        crashBike(b, cause, events);
        return true;
      }
      b.d = o.d + sideD * (o.halfWidth + bikeBox.halfWidth + 0.05);
      if (lateral > 0) b.yaw *= -0.3;
      b.speed *= 0.97;
      events.push({ type: 'scrape' });
      return false;
    }
    const closing = (b.speed * Math.cos(b.yaw) - speed) * sideS;
    if (closing > BUMP_SPEED) {
      crashBike(b, cause, events);
      return true;
    }
    // Gentle rear-end nudge: match speed and back off.
    b.speed = Math.max(0, speed);
    b.s = o.s - sideS * (o.halfLength + bikeBox.halfLength + 0.05);
    events.push({ type: 'scrape' });
    return false;
  }

  private resolveTrafficCollisions(events: SimEvent[]): void {
    const b = this.bike;
    if (b.crashTimer > 0 || b.invulnerable > 0) {
      b.hopOver = -1;
      return;
    }
    const bikeBox = this.bikeBox;
    const vehicles = this.traffic.vehicles;
    let hopping = false;
    for (let i = vehicles.length - 1; i >= 0; i--) {
      const v = vehicles[i]!;
      const vBox = { s: v.s, d: v.d, halfLength: v.length / 2, halfWidth: v.width / 2 };
      if (v.id === b.hopOver && overlaps(bikeBox, vBox)) {
        // Wheelie hop in progress: keep the bike above the roof until it has cleared the vehicle.
        hopping = true;
        if (b.height <= v.height) {
          b.height = v.height + 0.05;
          b.vy = Math.max(0, b.vy);
          b.airborne = true;
        }
        continue;
      }
      if (b.height > v.height) continue; // jumped over it!
      if (!overlaps(bikeBox, vBox)) continue;
      if (b.explosive > 0 && !VEHICLES[v.kind].indestructible) {
        // Explosive bonus: the vehicle blows up and the rider ploughs on.
        vehicles.splice(i, 1);
        b.speed *= 0.9;
        events.push({ type: 'explode', vehicleId: v.id, s: v.s, d: v.d });
        continue;
      }
      if (b.turbo > 0) {
        // Turbo: the rockets lift the bike over every vehicle in its way.
        const closing = Math.abs(b.speed * Math.cos(b.yaw) - v.speed * v.dir);
        hopBike(b, v.id, v.height, v.length + BIKE.length, closing, events);
        hopping = true;
        continue;
      }
      if (b.explosive > 0 && VEHICLES[v.kind].indestructible) {
        crashBike(b, 'vehicle', events, true);
        return;
      }
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
        this.touched.add(v.id);
        b.d = v.d + sideD * (vBox.halfWidth + bikeBox.halfWidth + 0.05);
        if (lateral > 0) b.yaw *= -0.3;
        b.speed *= 0.97;
        events.push({ type: 'scrape' });
        continue;
      }
      const closing = (b.speed * Math.cos(b.yaw) - v.speed * v.dir) * sideS;
      if (closing > BUMP_SPEED && canHop(b)) {
        // Riding a wheelie into a vehicle: the front wheel climbs it and the bike hops over.
        hopBike(b, v.id, v.height, v.length + BIKE.length, closing, events);
        hopping = true;
        continue;
      }
      if (closing > BUMP_SPEED) {
        crashBike(b, 'vehicle', events);
        return;
      }
      // Gentle rear-end nudge: match speed and back off.
      this.touched.add(v.id);
      b.speed = Math.max(0, v.speed * v.dir);
      b.s = v.s - sideS * (vBox.halfLength + bikeBox.halfLength + 0.05);
      events.push({ type: 'scrape' });
    }
    if (!hopping) b.hopOver = -1;
  }

  private resolveObstacles(events: SimEvent[]): void {
    const b = this.bike;
    if (b.crashTimer > 0 || b.invulnerable > 0) return;
    for (let i = 0; i < this.obstacles.length; i++) {
      const o = this.obstacles[i]!;
      const def = OBSTACLES[o.kind];
      if (o.knocked || b.height > def.height) continue;
      const box = { s: o.s, d: o.d, halfLength: def.halfLength, halfWidth: def.halfWidth };
      if (!overlaps(this.bikeBox, box)) continue;
      if (!def.solid || (b.explosive > 0 && !def.indestructible)) {
        o.knocked = true;
        b.speed *= CONES_SPEED_KEEP;
        events.push({ type: 'knock', index: i });
        continue;
      }
      if (this.bump(box, 0, 'obstacle', events)) return;
    }
  }

  /** State of level crossing `i` right now. */
  crossingAt(i: number, time = this.time): CrossingState {
    const c = this.crossings[i]!;
    return crossingState(c.period, c.offset, time);
  }

  private resolveCrossings(states: readonly CrossingState[], events: SimEvent[]): void {
    const b = this.bike;
    if (b.crashTimer > 0 || b.invulnerable > 0) return;
    for (let i = 0; i < states.length; i++) {
      const st = states[i]!;
      if (!st.closed) continue;
      const c = this.crossings[i]!;
      const hw = this.halfWidthAt(c.s);
      if (trainOnRoad(st, hw) && b.height < TRAIN_HEIGHT) {
        const train = { s: c.s, d: 0, halfLength: RAIL_HALF_WIDTH, halfWidth: hw + 1 };
        if (overlaps(this.bikeBox, train)) {
          crashBike(b, 'obstacle', events);
          return;
        }
      }
      if (st.arm < 0.5 || b.height > BARRIER_HEIGHT) continue;
      for (const k of [-1, 1]) {
        const barrier = { s: c.s + k * BARRIER_OFFSET, d: 0, halfLength: 0.15, halfWidth: hw + 1 };
        if (overlaps(this.bikeBox, barrier) && this.bump(barrier, 0, 'obstacle', events)) return;
      }
    }
  }

  /** After a crash, drop the rider on a lane that's free of traffic. */
  private placeSafely(): void {
    const b = this.bike;
    if (b.route >= 0) {
      b.d = 0;
      return;
    }
    // Never back on the rails while the barriers are down.
    this.crossings.forEach((c, i) => {
      const near = b.s > c.s - BARRIER_OFFSET - 1 && b.s < c.s + BARRIER_OFFSET + 1;
      if (near && this.crossingAt(i).closed) b.s = c.s - BARRIER_OFFSET - 3;
    });
    const hw = this.halfWidthAt(b.s);
    const lanes = [...this.stage.lanes.forward, ...this.stage.lanes.oncoming].filter((d) => laneFits(d, hw));
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
    this.roadVy = 0;
    this.traffic.vehicles.length = 0;
    this.traffic.populate(b.s);
    this.wheelieRun = 0;
    this.airtime = 0;
    const r = this.rival;
    if (r && !r.finished && r.bike.s < b.s - 20) {
      const rb = createBike(b.s - 20, r.targetD);
      rb.crashes = r.bike.crashes;
      r.bike = rb;
    }
  }

  /** Rival distance ahead of the player (negative = behind), or null without a rival. */
  get rivalGap(): number | null {
    return this.rival ? this.rival.bike.s - this.mainS : null;
  }

  get progress(): number {
    return Math.min(1, this.mainS / this.rules.finishS);
  }

  get score(): number {
    return computeScore(this.race, this.mainS);
  }
}

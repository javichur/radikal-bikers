import { Rng } from '../core/rng';
import type { CharacterDef } from '../content/characters';
import type { StageDef } from '../content/stages';
import type { ControlState } from '../input/types';
import { wrapAngle } from '../core/math';
import { BIKE, canHop, crashBike, hopBike, createBike, landBike, launchBike, stepBike, type BikeState } from './bike';
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
import { buildRoute, ROUTE_HALF_WIDTH, routeToMainS, type Route } from './shortcuts';
import { Track } from './track';
import { overlaps, Traffic, type Vehicle } from './traffic';

export interface Ramp {
  readonly s: number;
  readonly d: number;
  readonly width: number;
}

/** Explosive bonus box. */
export interface Pickup {
  /** -1 = main road, otherwise shortcut index. */
  readonly route: number;
  readonly s: number;
  readonly d: number;
  /** Seconds until it reappears after being collected (0 = available). */
  respawn: number;
}

const BUMP_SPEED = 4;
export const PICKUP_RADIUS = 1.6;
export const PICKUP_RESPAWN = 25;
/** Points for every vehicle blown up. */
export const EXPLODE_POINTS = 1000;
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
  bike: BikeState;
  race: RaceState;
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
    this.routes = stage.shortcuts.map((def, i) => buildRoute(this.track, stage.roadHalfWidth, def, i));
    this.pickups = stage.pickups.map((p) => ({
      route: p.route,
      s: p.at * this.trackOf(p.route).length,
      d: p.d,
      respawn: 0,
    }));
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

    const track = this.currentTrack;
    const here = track.sample(b.s);
    const prevY = here.y;
    stepBike(
      b,
      controls,
      this.character.stats,
      {
        curvature: here.curvature,
        roadHalfWidth: this.roadHalfWidth,
        slope: here.slope,
        openSide: this.openSideAt(b.s),
      },
      dt,
      events,
    );
    this.followRoad(track, prevY, dt, events);

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
    this.traffic.update(this.mainS, onMain ? b.d : Infinity, b.speed, dt, events);
    if (onMain) this.resolveTrafficCollisions(events);
    if (events.some((e) => e.type === 'respawn')) this.placeSafely();

    if (raceRunning) stepRace(this.race, this.rules, this.mainS, dt, events);
    return events;
  }

  /** Track the bike is currently riding on. */
  get currentTrack(): Track {
    return this.trackOf(this.bike.route);
  }

  trackOf(route: number): Track {
    return route < 0 ? this.track : this.routes[route]!.track;
  }

  private get roadHalfWidth(): number {
    return this.bike.route < 0 ? this.stage.roadHalfWidth : ROUTE_HALF_WIDTH;
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
  private followRoad(track: Track, prevY: number, dt: number, events: SimEvent[]): void {
    const b = this.bike;
    const p = track.sample(b.s);
    if (b.airborne) {
      b.height -= p.y - prevY;
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
      const limit = this.stage.roadHalfWidth - BIKE.wallMargin;
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
    const inside = r.side * p.d < this.stage.roadHalfWidth - 1;
    if (inside || b.s >= L || b.s <= 0) this.moveTo(-1, this.track, p.s, p.d, w.heading);
  }

  private moveTo(route: number, track: Track, s: number, d: number, oldHeading: number): void {
    const b = this.bike;
    const h = track.sample(s).heading;
    const hw = (route < 0 ? this.stage.roadHalfWidth : ROUTE_HALF_WIDTH) - BIKE.wallMargin;
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
      b.explosive = BIKE.explosiveDuration;
      events.push({ type: 'pickup', kind: 'explosive' });
    }
  }

  private resolveTrafficCollisions(events: SimEvent[]): void {
    const b = this.bike;
    if (b.crashTimer > 0 || b.invulnerable > 0) {
      b.hopOver = -1;
      return;
    }
    const bikeBox = { s: b.s, d: b.d, halfLength: BIKE.length / 2, halfWidth: BIKE.width / 2 };
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
      if (b.explosive > 0) {
        // Explosive bonus: the vehicle blows up and the rider ploughs on.
        vehicles.splice(i, 1);
        b.speed *= 0.9;
        this.race.bonusPoints += EXPLODE_POINTS;
        events.push({ type: 'explode', vehicleId: v.id, s: v.s, d: v.d });
        continue;
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
      b.speed = Math.max(0, v.speed * v.dir);
      b.s = v.s - sideS * (vBox.halfLength + bikeBox.halfLength + 0.05);
      events.push({ type: 'scrape' });
    }
    if (!hopping) b.hopOver = -1;
  }

  /** After a crash, drop the rider on a lane that's free of traffic. */
  private placeSafely(): void {
    const b = this.bike;
    if (b.route >= 0) {
      b.d = 0;
      return;
    }
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
    this.roadVy = 0;
    this.traffic.vehicles.length = 0;
    this.traffic.populate(b.s);
  }

  get progress(): number {
    return Math.min(1, this.mainS / this.rules.finishS);
  }

  get score(): number {
    return computeScore(this.race, this.mainS);
  }
}

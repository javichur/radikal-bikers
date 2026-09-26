import { approach } from '../core/math';
import type { Rng } from '../core/rng';
import { DEFAULT_TRAFFIC_MIX, VEHICLE_KINDS, VEHICLES, type TrafficMix, type VehicleKind } from '../content/vehicles';
import type { SimEvent } from './events';

export interface Vehicle {
  readonly id: number;
  readonly kind: VehicleKind;
  s: number;
  d: number;
  /** +1 travels with the player, -1 is oncoming. */
  readonly dir: 1 | -1;
  speed: number;
  readonly cruiseSpeed: number;
  readonly length: number;
  readonly width: number;
  readonly height: number;
  honkCooldown: number;
  /** Visual colour variant. */
  readonly variant: number;
}

export interface TrafficConfig {
  readonly trackLength: number;
  readonly forwardLanes: readonly number[];
  readonly oncomingLanes: readonly number[];
  readonly density: number;
  /** Metres behind / ahead of the player where traffic lives. */
  readonly behind?: number;
  readonly ahead?: number;
  /** No traffic is spawned before this distance (start grid). */
  readonly startClearance?: number;
  /** Relative spawn probability per vehicle kind (defaults to `DEFAULT_TRAFFIC_MIX`). */
  readonly mix?: TrafficMix;
  /** Cruise speed multiplier for oncoming traffic (fast country roads). */
  readonly oncomingSpeedScale?: number;
}

/** Distance kept by traffic before a closed level crossing (clear of the jump ramp in front of it). */
export const CROSSING_STOP_GAP = 14;

const MIN_SPAWN_GAP = 22;
const HONK_DISTANCE = 16;

export class Traffic {
  readonly vehicles: Vehicle[] = [];
  private nextId = 1;
  private readonly behind: number;
  private readonly ahead: number;
  private readonly startClearance: number;
  private readonly mix: TrafficMix;
  private readonly weightTotal: number;

  constructor(
    private readonly cfg: TrafficConfig,
    private readonly rng: Rng,
  ) {
    this.behind = cfg.behind ?? 90;
    this.ahead = cfg.ahead ?? 340;
    this.startClearance = cfg.startClearance ?? 70;
    this.mix = cfg.mix ?? DEFAULT_TRAFFIC_MIX;
    this.weightTotal = VEHICLE_KINDS.reduce((a, k) => a + (this.mix[k] ?? 0), 0);
  }

  /** Fills the window around the player at race start. */
  populate(playerS: number): void {
    let attempts = 0;
    while (this.vehicles.length < this.cfg.density && attempts++ < this.cfg.density * 20) {
      const s = this.rng.range(playerS + 40, playerS + this.ahead);
      this.trySpawn(s);
    }
  }

  private pickKind(): VehicleKind {
    let r = this.rng.next() * this.weightTotal;
    let last: VehicleKind = 'car';
    for (const k of VEHICLE_KINDS) {
      const w = this.mix[k] ?? 0;
      if (w <= 0) continue;
      last = k;
      r -= w;
      if (r <= 0) return k;
    }
    return last;
  }

  private trySpawn(s: number): Vehicle | null {
    if (s < this.startClearance || s > this.cfg.trackLength - 5) return null;
    const oncoming = this.rng.next() < 0.45;
    const lanes = oncoming ? this.cfg.oncomingLanes : this.cfg.forwardLanes;
    if (lanes.length === 0) return null;
    const d = this.rng.pick(lanes);
    const blocked = this.vehicles.some((v) => v.d === d && Math.abs(v.s - s) < MIN_SPAWN_GAP);
    if (blocked) return null;
    const def = VEHICLES[this.pickKind()];
    // Long vehicles (trams) need more room than the fixed spawn gap.
    const clear = (v: Vehicle): boolean => v.d !== d || Math.abs(v.s - s) >= (v.length + def.length) / 2 + 4;
    if (!this.vehicles.every(clear)) return null;
    const cruise = this.rng.range(def.minSpeed, def.maxSpeed) * (oncoming ? (this.cfg.oncomingSpeedScale ?? 1) : 1);
    const v: Vehicle = {
      id: this.nextId++,
      kind: def.kind,
      s,
      d,
      dir: oncoming ? -1 : 1,
      speed: cruise,
      cruiseSpeed: cruise,
      length: def.length,
      width: def.width,
      height: def.height,
      honkCooldown: 0,
      variant: this.rng.int(0, 7),
    };
    this.vehicles.push(v);
    return v;
  }

  /** Nearest vehicle ahead in the same lane, in travel direction. */
  leaderOf(v: Vehicle): { vehicle: Vehicle; gap: number } | null {
    let best: Vehicle | null = null;
    let bestGap = Infinity;
    for (const o of this.vehicles) {
      if (o === v || o.d !== v.d) continue;
      const gap = (o.s - v.s) * v.dir - (o.length + v.length) / 2;
      if (gap > -0.5 && gap < bestGap) {
        bestGap = gap;
        best = o;
      }
    }
    return best ? { vehicle: best, gap: bestGap } : null;
  }

  /**
   * @param closedCrossings main-road distances of level crossings whose barriers are down: traffic stops before them.
   */
  update(
    playerS: number,
    playerD: number,
    playerSpeed: number,
    dt: number,
    events: SimEvent[],
    closedCrossings: readonly number[] = [],
  ): void {
    for (const v of this.vehicles) {
      v.honkCooldown = Math.max(0, v.honkCooldown - dt);
      let target = v.cruiseSpeed;
      const safe = 8 + v.speed * 0.9;
      const leader = this.leaderOf(v);
      if (leader && leader.gap < safe) target = Math.min(target, leader.vehicle.speed * (leader.gap / safe));
      for (const c of closedCrossings) {
        const gap = (c - v.dir * CROSSING_STOP_GAP - v.s) * v.dir - v.length / 2;
        if (gap > -0.5 && gap < safe) target = Math.min(target, v.cruiseSpeed * Math.max(0, gap / safe - 0.1));
      }
      // React to the player blocking the lane.
      const toPlayer = (playerS - v.s) * v.dir - v.length / 2;
      const sameLane = Math.abs(playerD - v.d) < v.width / 2 + 1;
      if (sameLane && toPlayer > 0 && toPlayer < HONK_DISTANCE) {
        if (v.dir === -1 || playerSpeed < v.speed) {
          target = Math.min(target, v.dir === 1 ? Math.max(0, playerSpeed) : v.speed * 0.6);
          if (v.honkCooldown === 0) {
            v.honkCooldown = 4;
            events.push({ type: 'honk', vehicleId: v.id });
          }
        }
      }
      v.speed = approach(v.speed, Math.max(0, target), (target < v.speed ? 12 : 3) * dt);
      v.s += v.speed * v.dir * dt;
    }

    // Recycle vehicles that left the active window.
    const minS = playerS - this.behind;
    const maxS = playerS + this.ahead;
    for (let i = this.vehicles.length - 1; i >= 0; i--) {
      const v = this.vehicles[i]!;
      if (v.s < minS || v.s > maxS + 40 || v.s < 0 || v.s > this.cfg.trackLength) this.vehicles.splice(i, 1);
    }
    let attempts = 0;
    while (this.vehicles.length < this.cfg.density && attempts++ < 6) {
      this.trySpawn(this.rng.range(maxS - 90, maxS));
    }
  }
}

export interface Box {
  readonly s: number;
  readonly d: number;
  readonly halfLength: number;
  readonly halfWidth: number;
}

export const overlaps = (a: Box, b: Box): boolean =>
  Math.abs(a.s - b.s) < a.halfLength + b.halfLength && Math.abs(a.d - b.d) < a.halfWidth + b.halfWidth;

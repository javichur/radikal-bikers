export type VehicleKind = 'car' | 'taxi' | 'van' | 'bus' | 'truck' | 'motocarro' | 'tram';

export interface VehicleDef {
  readonly kind: VehicleKind;
  readonly length: number;
  readonly width: number;
  readonly height: number;
  readonly minSpeed: number;
  readonly maxSpeed: number;
  /** Relative spawn probability in the default traffic mix (0 = only when a stage asks for it). */
  readonly weight: number;
  /** Rides on rails: the explosive bonus cannot blow it up. */
  readonly indestructible?: boolean;
}

export const VEHICLES: Readonly<Record<VehicleKind, VehicleDef>> = {
  car: { kind: 'car', length: 4.4, width: 1.9, height: 1.5, minSpeed: 9, maxSpeed: 15, weight: 5 },
  taxi: { kind: 'taxi', length: 4.6, width: 1.9, height: 1.6, minSpeed: 10, maxSpeed: 16, weight: 2 },
  van: { kind: 'van', length: 5.2, width: 2.1, height: 2.3, minSpeed: 8, maxSpeed: 13, weight: 2 },
  bus: { kind: 'bus', length: 11, width: 2.6, height: 3.2, minSpeed: 7, maxSpeed: 11, weight: 1 },
  truck: { kind: 'truck', length: 9, width: 2.5, height: 3.4, minSpeed: 7, maxSpeed: 12, weight: 1 },
  /** Three-wheeled delivery van, slow and everywhere in old town streets. */
  motocarro: { kind: 'motocarro', length: 3.2, width: 1.5, height: 1.8, minSpeed: 6, maxSpeed: 9, weight: 0 },
  tram: {
    kind: 'tram',
    length: 20,
    width: 2.5,
    height: 3.5,
    minSpeed: 7,
    maxSpeed: 9,
    weight: 0,
    indestructible: true,
  },
};

export const VEHICLE_KINDS = Object.keys(VEHICLES) as VehicleKind[];

/** Relative spawn probabilities per vehicle kind. */
export type TrafficMix = Partial<Record<VehicleKind, number>>;

export const DEFAULT_TRAFFIC_MIX: TrafficMix = Object.fromEntries(VEHICLE_KINDS.map((k) => [k, VEHICLES[k].weight]));

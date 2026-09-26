import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { OBSTACLES, type ObstacleKind } from '../content/obstacles';
import type { SceneryStyle } from '../content/stages';
import { BARRIER_OFFSET, RAIL_HALF_WIDTH, TRAIN_LENGTH } from '../sim/crossing';
import { RAIL_HALF_LENGTH } from '../sim/scenery';
import type { Range } from '../sim/shortcuts';
import type { Track } from '../sim/track';
import { toon, toonGradient, withOutline } from './materials';
import { stripeTexture, waterTexture } from './textures';
import { inRanges, sweep } from './trackGeometry';
import { CONTACT_WIRE_HEIGHT } from './vehicleModel';

/** Height of the barrier arm above the road. */
const BARRIER_ARM_HEIGHT = 0.9;

/** How the procedural scenery of a stage looks (buildings, trees, kerbs, tunnels...). */
export interface SceneryLook {
  readonly buildingWidth: readonly [number, number];
  readonly buildingDepth: readonly [number, number];
  /** Heights of the buildings along the main road and along shortcuts. */
  readonly mainHeight: readonly [number, number];
  readonly routeHeight: readonly [number, number];
  /** Space between consecutive buildings of a row. */
  readonly rowGap: readonly [number, number];
  /** Extra distance between the pavement and the building fronts along the main road. */
  readonly setback: number;
  readonly roof: number;
  /** Corrugated sheds instead of windowed blocks. */
  readonly sheds: boolean;
  readonly sidewalk: number;
  readonly curb: number;
  readonly tree: 'round' | 'palm' | 'cypress' | 'orange';
  /** Chance of a roadside prop at each slot, and of that prop being a tree rather than a street lamp. */
  readonly propChance: number;
  readonly treeChance: number;
  readonly tunnel: 'hill' | 'arcade';
  readonly cobbles: boolean;
  /** Metal crash barriers along the road edges, and grassy embankments under raised road. */
  readonly guardrails: boolean;
  /** Stacks of shipping containers among the buildings, and tower cranes. */
  readonly containers: boolean;
  /** Look of the trams: modern articulated units or vintage two-car sets with a trolley pole. */
  readonly tram: 'modern' | 'vintage';
  /** Overhead contact wires, poles and span wires above the tram lanes. */
  readonly catenary: boolean;
}

const CITY: SceneryLook = {
  buildingWidth: [10, 20],
  buildingDepth: [10, 18],
  mainHeight: [9, 42],
  routeHeight: [7, 22],
  rowGap: [1, 6],
  setback: 0,
  roof: 0x6c757d,
  sheds: false,
  sidewalk: 0xd9d4c7,
  curb: 0xa8a39a,
  tree: 'round',
  propChance: 0.6,
  treeChance: 0.5,
  tunnel: 'hill',
  cobbles: false,
  guardrails: false,
  containers: false,
  tram: 'modern',
  catenary: false,
};

export const LOOKS: Readonly<Record<SceneryStyle, SceneryLook>> = {
  city: CITY,
  beach: { ...CITY, mainHeight: [9, 30], routeHeight: [6, 16], sidewalk: 0xf6e7c1, tree: 'palm', treeChance: 0.7 },
  oldtown: {
    ...CITY,
    buildingWidth: [8, 14],
    mainHeight: [11, 20],
    routeHeight: [9, 16],
    rowGap: [0, 1.5],
    roof: 0xb5522f,
    sidewalk: 0xcdb99c,
    curb: 0x9c8b76,
    propChance: 0.45,
    treeChance: 0,
    tunnel: 'arcade',
    cobbles: true,
    tram: 'vintage',
    catenary: true,
  },
  industrial: {
    ...CITY,
    buildingWidth: [22, 40],
    buildingDepth: [18, 30],
    mainHeight: [8, 15],
    routeHeight: [6, 12],
    rowGap: [4, 14],
    setback: 4,
    roof: 0x8a8f94,
    sheds: true,
    sidewalk: 0xb0aca4,
    curb: 0x8d8a84,
    treeChance: 0.15,
    containers: true,
  },
  hills: {
    ...CITY,
    buildingWidth: [8, 13],
    buildingDepth: [8, 11],
    mainHeight: [5, 8],
    routeHeight: [5, 7],
    rowGap: [70, 170],
    setback: 14,
    roof: 0xb5522f,
    sidewalk: 0xa39e93,
    curb: 0xc9c9c9,
    tree: 'cypress',
    propChance: 0.7,
    treeChance: 1,
    guardrails: true,
  },
  valencia: {
    ...CITY,
    // Continuous Eixample blocks of 6-8 storeys with glazed-tile roofs; orange trees and granite kerbs.
    buildingWidth: [12, 22],
    buildingDepth: [14, 22],
    mainHeight: [19, 27],
    routeHeight: [12, 19],
    rowGap: [0, 0.6],
    roof: 0x2a6fb0,
    sidewalk: 0xe6dccb,
    curb: 0x9a958c,
    tree: 'orange',
    propChance: 0.65,
    treeChance: 0.6,
    tunnel: 'arcade',
  },
};

/** Tree geometries (trunk + crown, and fruit for orange trees), origin at the foot. */
export const treeGeometries = (
  kind: SceneryLook['tree'],
): [THREE.BufferGeometry, THREE.BufferGeometry, number, THREE.BufferGeometry?] => {
  switch (kind) {
    case 'palm': {
      const trunk = new THREE.CylinderGeometry(0.16, 0.26, 6.5, 6);
      trunk.translate(0, 3.25, 0);
      const crown = new THREE.ConeGeometry(2.6, 1.3, 7, 1, true);
      crown.rotateX(Math.PI);
      crown.translate(0, 6.5, 0);
      return [trunk, crown, 0x3a9d23];
    }
    case 'cypress': {
      const trunk = new THREE.CylinderGeometry(0.12, 0.16, 0.8, 5);
      trunk.translate(0, 0.4, 0);
      const crown = new THREE.ConeGeometry(0.9, 7, 8);
      crown.translate(0, 4.1, 0);
      return [trunk, crown, 0x2d6a4f];
    }
    case 'orange': {
      // Orange tree: short trunk and a round dark crown dotted with fruit.
      const trunk = new THREE.CylinderGeometry(0.13, 0.18, 1.6, 6);
      trunk.translate(0, 0.8, 0);
      const crown = new THREE.IcosahedronGeometry(1.3, 1);
      crown.translate(0, 2.5, 0);
      const fruits: THREE.BufferGeometry[] = [];
      for (let i = 0; i < 9; i++) {
        const a = i * 2.4;
        const y = Math.sin(i * 1.7) * 0.8;
        const r = Math.sqrt(1.3 * 1.3 - y * y) + 0.05;
        const fruit = new THREE.IcosahedronGeometry(0.17, 0);
        fruit.translate(Math.cos(a) * r, 2.5 + y, Math.sin(a) * r);
        fruits.push(fruit);
      }
      return [trunk, crown, 0x2f7d32, mergeGeometries(fruits)];
    }
    default: {
      const trunk = new THREE.CylinderGeometry(0.15, 0.2, 2, 6);
      trunk.translate(0, 1, 0);
      const crown = new THREE.IcosahedronGeometry(1.4, 0);
      crown.translate(0, 3, 0);
      return [trunk, crown, 0x52b788];
    }
  }
};

/** Sea surface over a world XZ polygon. */
export const buildSea = (poly: readonly (readonly [number, number])[], root: THREE.Group): void => {
  const shape = new THREE.Shape(poly.map(([x, z]) => new THREE.Vector2(x, -z)));
  const geo = new THREE.ShapeGeometry(shape);
  geo.rotateX(-Math.PI / 2);
  const tex = waterTexture();
  tex.repeat.set(1 / 20, 1 / 20);
  const sea = new THREE.Mesh(geo, toon(0xffffff, { map: tex }));
  sea.position.y = 0.02;
  sea.receiveShadow = true;
  root.add(sea);
};

/** Park lawn over a world XZ polygon (just above the ground, under roads and water). */
export const buildPark = (poly: readonly (readonly [number, number])[], color: number, root: THREE.Group): void => {
  const shape = new THREE.Shape(poly.map(([x, z]) => new THREE.Vector2(x, -z)));
  const geo = new THREE.ShapeGeometry(shape);
  geo.rotateX(-Math.PI / 2);
  const park = new THREE.Mesh(geo, toon(color));
  park.position.y = -0.02;
  park.receiveShadow = true;
  root.add(park);
};

/**
 * Tram catenary: a contact wire over each lane at `lanes` offsets, hung from span wires between pairs of cast-iron poles
 * on the pavements every `spacing` metres. No poles where `skip` ranges (tunnels, side streets, gates) are.
 */
export const buildCatenary = (
  track: Track,
  lanes: readonly number[],
  hw: number,
  skip: readonly Range[],
  root: THREE.Group,
  spacing = 30,
): THREE.Group => {
  const H = CONTACT_WIRE_HEIGHT;
  const g = new THREE.Group();
  g.name = 'catenary';
  const wires = lanes.map((d) =>
    sweep(
      track,
      [
        [d - 0.03, H],
        [d, H + 0.03],
        [d + 0.03, H],
        [d, H - 0.03],
        [d - 0.03, H],
      ],
      0,
      track.length,
      2,
      4,
    ),
  );
  if (wires.length > 0) g.add(new THREE.Mesh(mergeGeometries(wires), toon(0x222222)));
  const iron: THREE.BufferGeometry[] = [];
  const add = (geo: THREE.BufferGeometry, x: number, y: number, z: number, yaw = 0): void => {
    geo.rotateY(yaw);
    geo.translate(x, y, z);
    iron.push(geo);
  };
  const spanY = H + 0.7;
  for (let s = 12; s < track.length - 6; s += spacing) {
    if (inRanges(s, skip, 4)) continue;
    const [a, b] = [track.toWorld(s, -(hw + 1)), track.toWorld(s, hw + 1)];
    for (const p of [a, b]) {
      // Fluted base, slender shaft and ball finial.
      add(new THREE.CylinderGeometry(0.22, 0.3, 1, 8), p.x, p.y + 0.5, p.z);
      add(new THREE.CylinderGeometry(0.1, 0.14, spanY + 0.5, 8), p.x, p.y + (spanY + 0.5) / 2, p.z);
      add(new THREE.SphereGeometry(0.17, 8, 6), p.x, p.y + spanY + 0.6, p.z);
    }
    // Span wire across the street, with a dropper and insulator down to each contact wire.
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    const yaw = Math.atan2(b.x - a.x, b.z - a.z);
    add(new THREE.BoxGeometry(0.05, 0.05, len), (a.x + b.x) / 2, (a.y + b.y) / 2 + spanY, (a.z + b.z) / 2, yaw);
    for (const d of lanes) {
      const q = track.toWorld(s, d);
      add(new THREE.BoxGeometry(0.04, 0.7, 0.04), q.x, q.y + H + 0.35, q.z);
      add(new THREE.BoxGeometry(0.14, 0.14, 0.14), q.x, q.y + spanY, q.z, yaw);
    }
  }
  if (iron.length > 0) {
    const mesh = new THREE.Mesh(mergeGeometries(iron), toon(0x2f3b33));
    mesh.castShadow = true;
    g.add(mesh);
  }
  root.add(g);
  return g;
};

/** Beach umbrella with a striped canopy. */
export const umbrellaModel = (color: number): THREE.Group => {
  const g = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.4, 5), toon(0xf1faee));
  pole.position.y = 1.2;
  const canopy = new THREE.Mesh(new THREE.ConeGeometry(1.6, 0.6, 8), toon(color));
  canopy.position.y = 2.4;
  canopy.castShadow = true;
  const towel = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.05, 1.8), toon(0xffffff));
  towel.position.set(1.2, 0.03, 0);
  g.add(pole, canopy, towel);
  return g;
};

/** Portico: a building bridging the street, with an arched passage and arcaded ends. */
export const arcadeProfiles = (W: number): { inner: [number, number][]; outer: [number, number][] } => {
  const inner: [number, number][] = [
    [-W, -0.2],
    [-W, 5],
  ];
  for (let k = 1; k < 8; k++) {
    const a = Math.PI - (k * Math.PI) / 8;
    inner.push([W * Math.cos(a), 5 + 2.6 * Math.sin(a)]);
  }
  inner.push([W, 5], [W, -0.2]);
  const outer: [number, number][] = [
    [-W - 12, -0.3],
    [-W - 12, 15],
    [W + 12, 15],
    [W + 12, -0.3],
  ];
  return { inner, outer };
};

/** Fixed obstacle on the road: a row of cones, a road works fence or a piazza fountain. Faces +Z. */
export const obstacleModel = (kind: ObstacleKind): THREE.Group => {
  const g = new THREE.Group();
  const def = OBSTACLES[kind];
  switch (kind) {
    case 'cones': {
      const coneGeo = new THREE.ConeGeometry(0.28, 0.75, 10);
      coneGeo.translate(0, 0.375, 0);
      const bandGeo = new THREE.CylinderGeometry(0.17, 0.2, 0.14, 10);
      bandGeo.translate(0, 0.42, 0);
      const orange = toon(0xff6b1a);
      const white = toon(0xffffff);
      for (let i = 0; i < 5; i++) {
        const c = new THREE.Group();
        c.position.z = -def.halfLength + (i * def.halfLength * 2) / 4;
        const cone = new THREE.Mesh(coneGeo, orange);
        cone.castShadow = true;
        c.add(cone, new THREE.Mesh(bandGeo, white));
        g.add(c);
      }
      break;
    }
    case 'barrier': {
      const panel = new THREE.Mesh(
        new THREE.BoxGeometry(0.15, 0.6, def.halfLength * 2),
        toon(0xffffff, { map: stripeTexture() }),
      );
      panel.position.y = 0.75;
      panel.castShadow = true;
      g.add(withOutline(panel, 0.05));
      const footGeo = new THREE.BoxGeometry(def.halfWidth * 2, 0.15, 0.4);
      const legGeo = new THREE.BoxGeometry(0.08, 1.1, 0.08);
      for (const z of [-def.halfLength + 0.3, def.halfLength - 0.3]) {
        const foot = new THREE.Mesh(footGeo, toon(0xe63946));
        foot.position.set(0, 0.08, z);
        const leg = new THREE.Mesh(legGeo, toon(0xdddddd));
        leg.position.set(0, 0.55, z);
        g.add(foot, leg);
      }
      break;
    }
    case 'fountain': {
      const stone = toon(0xe9dcc4);
      const basin = new THREE.Mesh(new THREE.CylinderGeometry(def.halfWidth, def.halfWidth + 0.1, 0.7, 8), stone);
      basin.position.y = 0.35;
      basin.castShadow = true;
      const water = new THREE.Mesh(
        new THREE.CylinderGeometry(def.halfWidth - 0.2, def.halfWidth - 0.2, 0.05, 8),
        toon(0x6fc3df, { emissive: 0x0b3d4f }),
      );
      water.position.y = 0.62;
      const column = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.35, 1.6, 8), stone);
      column.position.y = 1.4;
      const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.3, 0.35, 10), stone);
      bowl.position.y = 2.2;
      const jet = new THREE.Mesh(new THREE.ConeGeometry(0.25, 0.6, 8), toon(0xbfe9ff, { emissive: 0x2a5d73 }));
      jet.position.y = 2.65;
      g.add(withOutline(basin, 0.06), water, column, bowl, jet);
      break;
    }
    case 'falla': {
      // Ninot-topped falla: a painted plinth, a stack of bright figures and a giant head with a party hat.
      const base = new THREE.Mesh(
        new THREE.CylinderGeometry(def.halfWidth, def.halfWidth + 0.1, 1.6, 8),
        toon(0xf4a259),
      );
      base.position.y = 0.8;
      base.castShadow = true;
      g.add(withOutline(base, 0.06));
      const tiers: [number, number, number, number][] = [
        [1.3, 1.6, 2.4, 0xe63946],
        [1.0, 1.2, 3.8, 0x3a86ff],
        [0.8, 1.2, 5.0, 0xffbe0b],
      ];
      for (const [r, h, y, color] of tiers) {
        const t = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.8, r, h, 7), toon(color));
        t.position.y = y;
        t.rotation.y = y;
        t.castShadow = true;
        g.add(withOutline(t, 0.05));
      }
      const head = new THREE.Mesh(new THREE.SphereGeometry(1.2, 10, 8), toon(0xffd6a5));
      head.position.y = 6.8;
      head.castShadow = true;
      const nose = new THREE.Mesh(new THREE.SphereGeometry(0.35, 8, 6), toon(0xff7b7b));
      nose.position.set(0, 6.7, 1.15);
      const hat = new THREE.Mesh(new THREE.ConeGeometry(0.7, 1.6, 8), toon(0x8338ec));
      hat.position.y = 8.3;
      g.add(withOutline(head, 0.06), nose, hat);
      for (const x of [-1, 1]) {
        const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.25, 2.2, 6), toon(0xffd6a5));
        arm.position.set(x * 1.3, 5.6, 0);
        arm.rotation.z = x * -0.9;
        g.add(arm);
      }
      break;
    }
    case 'terrassa': {
      // Café terrace along the kerb: two tables with chairs under parasols.
      const metal = toon(0x9aa0a6);
      const cloth = toon(0xf1faee);
      for (const z of [-def.halfLength * 0.5, def.halfLength * 0.5]) {
        const set = new THREE.Group();
        set.position.z = z;
        const top = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.05, 10), cloth);
        top.position.y = 0.75;
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.75, 5), metal);
        leg.position.y = 0.37;
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.4, 5), metal);
        pole.position.y = 1.4;
        const parasol = new THREE.Mesh(new THREE.ConeGeometry(1.1, 0.35, 8), toon(z < 0 ? 0xe63946 : 0xffbe0b));
        parasol.position.y = 2.1;
        parasol.castShadow = true;
        set.add(top, leg, pole, parasol);
        for (const dz of [-0.7, 0.7]) {
          const chair = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.45, 0.4), toon(0x6c584c));
          chair.position.set(0, 0.23, dz);
          set.add(chair);
        }
        g.add(set);
      }
      break;
    }
  }
  return g;
};

/** Standing or knocked-over pose of an obstacle model (cones scattered, fences flat on the ground). */
export const poseObstacle = (kind: ObstacleKind, model: THREE.Object3D, knocked: boolean): void => {
  if (kind === 'cones') {
    model.children.forEach((c, i) => {
      const k = i % 2 ? 1 : -1;
      c.rotation.z = knocked ? k * (Math.PI / 2) : 0;
      c.position.x = knocked ? k * 0.6 : 0;
      c.position.y = knocked ? 0.2 : 0;
    });
  } else if (kind === 'barrier') {
    model.rotation.z = knocked ? Math.PI / 2 : 0;
  } else if (kind === 'terrassa') {
    model.children.forEach((c, i) => {
      const k = i % 2 ? 1 : -1;
      c.rotation.z = knocked ? k * (Math.PI / 2) : 0;
      c.position.x = knocked ? k * 0.8 : 0;
      c.position.y = knocked ? 0.3 : 0;
    });
  }
};

export interface CrossingScene {
  /** Barrier hinges; rotate around Z by `sign * (1 - arm) * PI / 2` to raise them. */
  readonly hinges: readonly { readonly object: THREE.Object3D; readonly sign: number }[];
  /** Flashing red lamps (two alternating groups). */
  readonly lamps: readonly [THREE.MeshToonMaterial, THREE.MeshToonMaterial];
  /** Train body, moved across the road along local X (= -d). */
  readonly train: THREE.Object3D;
}

/** Railway across the road with half barriers, warning lights and a train. */
export const buildCrossing = (track: Track, s: number, halfWidth: number, root: THREE.Group): CrossingScene => {
  const p = track.toWorld(s, 0);
  const g = new THREE.Group();
  g.position.set(p.x, p.y, p.z);
  g.rotation.y = p.heading;
  root.add(g);

  // Ballast bed, sleepers and rails (local X runs across the road).
  const bed = new THREE.Mesh(
    new THREE.BoxGeometry(RAIL_HALF_LENGTH * 2, 0.1, RAIL_HALF_WIDTH * 2 + 1.2),
    toon(0x8a7f72),
  );
  bed.position.y = 0.0;
  bed.receiveShadow = true;
  g.add(bed);
  const sleeperGeo = new THREE.BoxGeometry(0.25, 0.08, RAIL_HALF_WIDTH * 2 - 0.6);
  const n = Math.floor((RAIL_HALF_LENGTH * 2) / 0.9);
  const sleepers = new THREE.InstancedMesh(sleeperGeo, toon(0x5c4632), n);
  const m = new THREE.Matrix4();
  let count = 0;
  for (let i = 0; i < n; i++) {
    const x = -RAIL_HALF_LENGTH + i * 0.9;
    if (Math.abs(x) < halfWidth + 1) continue;
    sleepers.setMatrixAt(count++, m.makeTranslation(x, 0.07, 0));
  }
  sleepers.count = count;
  g.add(sleepers);
  const railGeo = new THREE.BoxGeometry(RAIL_HALF_LENGTH * 2, 0.08, 0.1);
  for (const z of [-0.72, 0.72]) {
    const rail = new THREE.Mesh(railGeo, toon(0xb8b8b8));
    rail.position.set(0, 0.1, z);
    g.add(rail);
  }

  // Barriers on both sides of the rails, their arms spanning the whole road.
  const stripes = stripeTexture();
  const armLength = halfWidth * 2 + 0.6;
  const armGeo = new THREE.BoxGeometry(armLength, 0.14, 0.14);
  const armMat = toon(0xffffff, { map: stripes });
  // Own materials (not the shared cache): the renderer makes them flash.
  const lampA = new THREE.MeshToonMaterial({ color: 0x550000, gradientMap: toonGradient() });
  const lampB = new THREE.MeshToonMaterial({ color: 0x550000, gradientMap: toonGradient() });
  const hinges: { object: THREE.Object3D; sign: number }[] = [];
  const lampGeo = new THREE.SphereGeometry(0.16, 8, 6);
  for (const k of [1, -1] as const) {
    // k = +1: barrier before the rails, pivot on the right-hand side (local -X).
    const post = new THREE.Group();
    post.position.set(-k * (halfWidth + 1), 0, -k * BARRIER_OFFSET);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 3, 6), toon(0xf1faee));
    pole.position.y = 1.5;
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.6, 0.5), toon(0x495057));
    box.position.y = 0.5;
    post.add(pole, box);
    const cross = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.18, 0.05), toon(0xe63946));
    cross.position.y = 2.8;
    const cross2 = cross.clone();
    cross.rotation.z = 0.6;
    cross2.rotation.z = -0.6;
    post.add(cross, cross2);
    for (const [x, mat] of [
      [-0.25, lampA],
      [0.25, lampB],
    ] as const) {
      const lamp = new THREE.Mesh(lampGeo, mat);
      lamp.position.set(x, 2.2, -k * 0.15);
      post.add(lamp);
    }
    const hinge = new THREE.Group();
    hinge.position.y = BARRIER_ARM_HEIGHT;
    const arm = new THREE.Mesh(armGeo, armMat);
    arm.position.x = k * (armLength / 2);
    arm.castShadow = true;
    hinge.add(arm);
    post.add(hinge);
    g.add(post);
    hinges.push({ object: hinge, sign: k });
  }

  // Train: locomotive at the head (local -X end, towards +d) and two carriages.
  const train = new THREE.Group();
  const body = (len: number, color: number, x: number, h: number): void => {
    const b = new THREE.Mesh(new THREE.BoxGeometry(len, h, 3), toon(color));
    b.position.set(x, 0.7 + h / 2, 0);
    b.castShadow = true;
    train.add(withOutline(b, 0.08));
    const win = new THREE.Mesh(new THREE.BoxGeometry(len * 0.9, 0.8, 3.04), toon(0x2d3a5a));
    win.position.set(x, 0.7 + h * 0.7, 0);
    train.add(win);
  };
  const half = TRAIN_LENGTH / 2;
  body(16, 0xe63946, -half + 8, 3.5);
  body(21, 0x2a9d8f, -half + 16.5 + 11, 3.2);
  body(21, 0x2a9d8f, -half + 16.5 + 22 + 11, 3.2);
  const nose = new THREE.Mesh(new THREE.BoxGeometry(0.2, 1, 2.2), toon(0xffd166, { emissive: 0x665f30 }));
  nose.position.set(-half - 0.1, 2.2, 0);
  train.add(nose);
  train.visible = false;
  g.add(train);

  return { hinges, lamps: [lampA, lampB], train };
};

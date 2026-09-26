import * as THREE from 'three';
import type { Rng } from '../core/rng';
import type { River } from '../sim/scenery';
import {
  FACADE_GAP,
  ROUTE_HALF_WIDTH,
  routeToMainS,
  SHOP_DEPTH,
  SIDEWALK,
  type Range,
  type Route,
} from '../sim/shortcuts';
import type { World } from '../sim/world';
import { toon } from './materials';
import { glowInstances, glowMaterial, LAMP_LIGHT, poolGeometry, poolMatrix } from './nightLights';
import { arcadeProfiles } from './sceneryStyle';
import {
  alleyTexture,
  awningTexture,
  brickTexture,
  concreteTexture,
  dirtTexture,
  shelfTexture,
  signTexture,
  stripeTexture,
  tileTexture,
  waterTexture,
  windowTextures,
} from './textures';
import { rangesWhere, ribbon, segments, sweep, wall } from './trackGeometry';

/** Lawn of parks and dry riverbeds. */
export const PARK_GREEN = 0x7fbf5a;

/** Circular keep-out zone for procedural buildings. */
export interface Obstacle {
  readonly x: number;
  readonly z: number;
  readonly r: number;
}

/** A strip along a road where a row of buildings can stand. */
export interface BuildingRow {
  readonly route: number;
  readonly from: number;
  readonly to: number;
  /** Lateral distance from the road centre to the building fronts. */
  readonly offset: number;
  readonly minHeight: number;
  readonly maxHeight: number;
}

const SHOPS = [
  { name: 'SUPER', color: 0xf1faee, sign: '#2a9d8f', awning: '#2a9d8f' },
  { name: 'MODA', color: 0xffc6ff, sign: '#7209b7', awning: '#b5179e' },
  { name: 'TV·HIFI', color: 0xa0c4ff, sign: '#1d3557', awning: '#e63946' },
  { name: 'CAFÉ', color: 0xffd6a5, sign: '#6f4518', awning: '#e76f51' },
];

/** Local shops of the València stage: market stalls, horchata bars, fartons, fallas crafts and ceramics. */
const VALENCIA_SHOPS = [
  { name: 'MERCAT', color: 0xfff1d0, sign: '#2a6fb0', awning: '#f4a261' },
  { name: 'ORXATA', color: 0xfdf6e3, sign: '#8a5a2b', awning: '#2a9d8f' },
  { name: 'FARTONS', color: 0xffe8c2, sign: '#c8643b', awning: '#ffbe0b' },
  { name: 'FALLES', color: 0xffd6e0, sign: '#e63946', awning: '#8338ec' },
  { name: 'CERÀMICA', color: 0xe0f0ff, sign: '#1d4e89', awning: '#2a6fb0' },
];

let glass: THREE.MeshPhongMaterial | null = null;
let litGlass: THREE.MeshPhongMaterial | null = null;
/** Shop window glass; at night it glows with the light of the shop behind it. */
const glassMaterial = (night: boolean): THREE.MeshPhongMaterial =>
  night
    ? (litGlass ??= new THREE.MeshPhongMaterial({
        color: 0xffe8a3,
        emissive: 0x8a6f2a,
        specular: 0xffffff,
        shininess: 120,
        transparent: true,
        opacity: 0.45,
        depthWrite: false,
      }))
    : (glass ??= new THREE.MeshPhongMaterial({
        color: 0xbfe9ff,
        specular: 0xffffff,
        shininess: 120,
        transparent: true,
        opacity: 0.38,
        depthWrite: false,
      }));

/** Store with shop windows on the street side and at the back, which the shortcut runs straight through. */
const buildShop = (
  world: World,
  route: Route,
  range: Range,
  root: THREE.Group,
  obstacles: Obstacle[],
  panes: THREE.Object3D[],
  style: (typeof SHOPS)[number],
): void => {
  const main = world.track;
  const t = route.track;
  const hw = world.stage.roadHalfWidth;
  const night = world.stage.theme.night ?? false;
  const e = hw + SIDEWALK + FACADE_GAP;
  const D = SHOP_DEPTH;
  const H = 6.5;
  const midS = (range.from + range.to) / 2;
  const mp = t.sample(midS);
  const c = main.sample(main.project(mp.x, mp.z, routeToMainS(route, midS), 120).s);
  const fx = Math.sin(c.heading);
  const fz = Math.cos(c.heading);
  const rx = -Math.cos(c.heading) * route.side;
  const rz = Math.sin(c.heading) * route.side;
  const at = (u: number, lat: number, y: number): THREE.Vector3 =>
    new THREE.Vector3(c.x + fx * u + rx * lat, c.y + y, c.z + fz * u + rz * lat);
  const local = (x: number, z: number): { u: number; lat: number } => ({
    u: (x - c.x) * fx + (z - c.z) * fz,
    lat: (x - c.x) * rx + (z - c.z) * rz,
  });

  // Where the lane crosses each wall line (front = street side, back = alley side).
  const opening = (paneS: number): { lineLat: number; u0: number; u1: number; paneS: number } => {
    const p = t.sample(paneS);
    const lc = local(p.x, p.z);
    const lineLat = Math.abs(lc.lat - e) < Math.abs(lc.lat - (e + D)) ? e : e + D;
    const du = fx * Math.sin(p.heading) + fz * Math.cos(p.heading);
    const dl = rx * Math.sin(p.heading) + rz * Math.cos(p.heading);
    const us = [-1, 1].map((k) => {
      const q = t.toWorld(paneS, k * (ROUTE_HALF_WIDTH + 0.5));
      const l = local(q.x, q.z);
      return l.u + ((lineLat - l.lat) * du) / (Math.abs(dl) > 0.1 ? dl : 0.1);
    });
    return { lineLat, u0: Math.min(...us), u1: Math.max(...us), paneS };
  };
  const ops = [opening(range.from), opening(range.to)];
  const umin = Math.min(...ops.map((o) => o.u0)) - 3;
  const umax = Math.max(...ops.map((o) => o.u1)) + 3;
  const um = (umin + umax) / 2;

  const g = new THREE.Group();
  g.name = 'shop';
  root.add(g);
  const box = (
    w: number,
    h: number,
    l: number,
    mat: THREE.Material | THREE.Material[],
    u: number,
    lat: number,
    y: number,
  ): THREE.Mesh => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, l), mat);
    m.position.copy(at(u, lat, y));
    m.rotation.y = c.heading;
    m.castShadow = true;
    m.receiveShadow = true;
    g.add(m);
    return m;
  };

  const wallMat = toon(style.color);
  const trim = toon(0x495057);
  for (const o of ops) {
    const lat = o.lineLat;
    const mid = (o.u0 + o.u1) / 2;
    const w = o.u1 - o.u0;
    box(0.4, H, o.u0 - umin, wallMat, (umin + o.u0) / 2, lat, H / 2);
    box(0.4, H, umax - o.u1, wallMat, (o.u1 + umax) / 2, lat, H / 2);
    box(0.45, H - 3.8, w, wallMat, mid, lat, 3.8 + (H - 3.8) / 2);
    box(0.5, 0.18, w, trim, mid, lat, 3.75);
    for (const k of [-1, 1]) box(0.5, 3.8, 0.2, trim, mid + (k * w) / 2, lat, 1.9);
    const pane = box(0.1, 3.6, w, glassMaterial(night), mid, lat, 1.85);
    pane.castShadow = false;
    pane.renderOrder = 2;
    const idx = route.panes.findIndex((p) => p.s === o.paneS);
    if (idx >= 0) panes[idx] = pane;
    if (night) {
      // Light from the shop window spilling onto the lane outside.
      const spill = new THREE.Mesh(poolGeometry(w / 2 + 1.5, 0.5), glowMaterial(LAMP_LIGHT));
      spill.position.copy(at(mid, lat === e ? lat - 2 : lat + 2, 0.06));
      spill.scale.x = 0.6;
      spill.rotation.y = c.heading;
      spill.renderOrder = 1;
      g.add(spill);
    }
    if (lat === e) {
      const signTex = signTexture(style.name, style.sign);
      const sign = toon(
        0xffffff,
        night ? { map: signTex, emissive: 0xcccccc, emissiveMap: signTex } : { map: signTex },
      );
      box(0.25, 1.3, w + 2, [sign, sign, trim, trim, trim, trim], mid, lat - 0.3, 4.9);
      const awn = box(1.8, 0.08, w + 1.5, toon(0xffffff, { map: awningTexture(style.awning) }), mid, lat - 1, 3.95);
      awn.rotation.z = -route.side * 0.35;
    }
  }
  box(D, H, 0.4, wallMat, umin, e + D / 2, H / 2);
  box(D, H, 0.4, wallMat, umax, e + D / 2, H / 2);
  box(D + 0.8, 0.5, umax - umin + 0.8, toon(0x6c757d), um, e + D / 2, H + 0.25);
  box(D, 0.06, umax - umin, toon(0xffffff, { map: tileTexture() }), um, e + D / 2, 0.03).castShadow = false;

  // Interior: shelves and counters wherever they do not block the lane, and ceiling lights.
  const shelf = toon(0xffffff, { map: shelfTexture() });
  const counter = toon(0x8d5524);
  const lamp = toon(0xffffff, { emissive: 0xfff3b0 });
  let n = 0;
  for (let u = umin + 2; u <= umax - 2; u += 3.2) {
    for (const lat of [e + 2.2, e + D / 2, e + D - 2.2]) {
      const p = at(u, lat, 0);
      if (Math.abs(t.project(p.x, p.z, midS, 40).d) < ROUTE_HALF_WIDTH + 1.4) continue;
      if (n++ % 4 === 3) box(1.1, 1.1, 2.6, counter, u, lat, 0.55);
      else box(1.0, 2.1, 2.6, shelf, u, lat, 1.05);
    }
    box(0.5, 0.08, 1.6, lamp, u, e + D / 2, H - 0.12).castShadow = false;
  }
  if (night) {
    const floor = new THREE.Mesh(poolGeometry(1, 0.35), glowMaterial(LAMP_LIGHT));
    floor.position.copy(at(um, e + D / 2, 0.08));
    floor.scale.set(D / 2, 1, (umax - umin) / 2);
    floor.rotation.y = c.heading;
    floor.renderOrder = 1;
    g.add(floor);
  }
  obstacles.push({ ...at(um, e + D / 2, 0), r: Math.max(umax - umin, D) / 2 + 1 });
};

/** Back street (and shops) of a shortcut. Returns the glass panes in `route.panes` order. */
export const buildShortcut = (
  world: World,
  route: Route,
  root: THREE.Group,
  obstacles: Obstacle[],
  rows: BuildingRow[],
  rng: Rng,
): THREE.Object3D[] => {
  const main = world.track;
  const t = route.track;
  const hw = world.stage.roadHalfWidth;
  const e = hw + SIDEWALK + FACADE_GAP;
  const L = t.length;
  const lat: number[] = [];
  for (let s = 0; s <= L + 1; s++) {
    const p = t.sample(s);
    lat.push(route.side * main.project(p.x, p.z, routeToMainS(route, s), 120).d);
  }
  const latAt = (s: number): number => lat[Math.max(0, Math.min(lat.length - 1, Math.round(s)))]!;

  const outside = rangesWhere(0, L, 1, (s) => latAt(s) > hw + 0.3);
  const from = Math.max(0, (outside[0]?.from ?? 0) - 1.5);
  const to = Math.min(L, (outside[outside.length - 1]?.to ?? L) + 1.5);
  const dirt = route.kind === 'dirt';
  const asphalt = toon(0xffffff, { map: dirt ? dirtTexture() : alleyTexture() });
  const shopGaps = route.shops.map((r) => ({ from: r.from + 0.2, to: r.to - 0.2 }));
  for (const seg of segments(from, to, shopGaps)) {
    const m = new THREE.Mesh(ribbon(t, -ROUTE_HALF_WIDTH, ROUTE_HALF_WIDTH, 0.012, 1.5, 8, seg.from, seg.to), asphalt);
    m.receiveShadow = true;
    root.add(m);
  }
  for (let s = from; s <= to; s += 3) {
    const p = t.toWorld(s, 0);
    obstacles.push({ x: p.x, z: p.z, r: ROUTE_HALF_WIDTH + 1.4 });
  }

  // Walkways and graffiti brick walls once the lane is behind the first row of buildings; wooden fences along a
  // country dirt track.
  const start = route.kind === 'shop' ? e + SHOP_DEPTH + 0.3 : hw + SIDEWALK + 0.4;
  if (dirt) {
    const fence = toon(0x8d5524, { side: THREE.DoubleSide });
    for (const seg of rangesWhere(0, L, 1, (s) => latAt(s) > start)) {
      for (const k of [-1, 1]) {
        for (const [y0, y1] of [
          [0.45, 0.6],
          [0.85, 1],
        ] as const) {
          root.add(new THREE.Mesh(wall(t, k * (ROUTE_HALF_WIDTH + 0.6), y0, y1, seg.from, seg.to, 2, 4), fence));
        }
      }
    }
    return [];
  }
  const walkway = toon(0xbfb8ab);
  const bricks = toon(0xffffff, { map: brickTexture(), side: THREE.DoubleSide });
  for (const seg of rangesWhere(0, L, 1, (s) => latAt(s) > start)) {
    for (const k of [-1, 1]) {
      const a = k * ROUTE_HALF_WIDTH;
      const b = k * (ROUTE_HALF_WIDTH + 1.2);
      root.add(new THREE.Mesh(ribbon(t, Math.min(a, b), Math.max(a, b), 0.18, 2, 4, seg.from, seg.to), walkway));
      const w = new THREE.Mesh(wall(t, b, 0, 3, seg.from, seg.to, 2, 6), bricks);
      w.castShadow = true;
      w.receiveShadow = true;
      root.add(w);
    }
    if (seg.to - seg.from > 30) {
      for (const k of [-1, 1] as const) {
        rows.push({
          route: route.index,
          from: seg.from + 4,
          to: seg.to - 4,
          offset: k * (ROUTE_HALF_WIDTH + 1.5),
          minHeight: 7,
          maxHeight: 22,
        });
      }
    }
  }

  const panes: THREE.Object3D[] = [];
  const styles = world.stage.scenery === 'valencia' ? VALENCIA_SHOPS : SHOPS;
  route.shops.forEach((r) => buildShop(world, route, r, root, obstacles, panes, rng.pick(styles)));
  return panes;
};

/**
 * Covered section: arched concrete tube under a grassy hill (`hill`), or a portico — a building bridging the street
 * with an arched passage (`arcade`) — with portals and lights.
 */
export const buildTunnel = (
  world: World,
  range: Range,
  root: THREE.Group,
  obstacles: Obstacle[],
  style: 'hill' | 'arcade' = 'hill',
): void => {
  const t = world.track;
  const W = world.stage.roadHalfWidth + SIDEWALK + 0.6;
  const arcade = style === 'arcade';
  const night = world.stage.theme.night ?? false;
  let inner: [number, number][] = [[-W, -0.2]];
  inner.push([-W, 4.2]);
  for (let k = 1; k < 8; k++) {
    const a = Math.PI - (k * Math.PI) / 8;
    inner.push([W * Math.cos(a), 4.2 + 3.8 * Math.sin(a)]);
  }
  inner.push([W, 4.2], [W, -0.2]);
  let outer: [number, number][] = [
    [-W - 18, -0.3],
    [-W - 8, 6],
    [-W - 1, 9.5],
    [0, 12],
    [W + 1, 9.5],
    [W + 8, 6],
    [W + 18, -0.3],
  ];
  if (arcade) ({ inner, outer } = arcadeProfiles(W));
  const shell = new THREE.Mesh(
    sweep(t, inner, range.from, range.to, 2, 6),
    arcade
      ? toon(0xf2cc8f, { side: THREE.DoubleSide })
      : toon(0xd8cfc4, { map: concreteTexture(), side: THREE.DoubleSide }),
  );
  shell.castShadow = true;
  shell.receiveShadow = true;
  const windows = arcade ? windowTextures() : null;
  const hill = new THREE.Mesh(
    sweep(t, outer, range.from, range.to, 3, 20),
    windows
      ? toon(0xe9b872, {
          map: windows.map,
          side: THREE.DoubleSide,
          ...(night ? { emissive: 0xffffff, emissiveMap: windows.glow } : {}),
        })
      : toon(0x6aa84f),
  );
  hill.castShadow = true;
  hill.receiveShadow = true;
  root.add(shell, hill);

  // Portals.
  const shape = new THREE.Shape(outer.map(([x, y]) => new THREE.Vector2(x, y)));
  shape.holes.push(new THREE.Path([...inner].reverse().map(([x, y]) => new THREE.Vector2(x, y + 0.05))));
  const portalGeo = new THREE.ExtrudeGeometry(shape, { depth: 1.4, bevelEnabled: false });
  portalGeo.translate(0, 0, -0.7);
  const portalMat = arcade ? toon(0xd98e5f) : toon(0xa39b90, { map: concreteTexture() });
  const bandGeo = new THREE.BoxGeometry(W * 1.6, 0.8, 1.6);
  const bandMat = toon(0xffffff, { map: stripeTexture() });
  for (const s of [range.from, range.to]) {
    const p = t.toWorld(s, 0);
    const portal = new THREE.Mesh(portalGeo, portalMat);
    portal.position.set(p.x, p.y, p.z);
    portal.rotation.y = p.heading;
    portal.castShadow = true;
    root.add(portal);
    if (arcade) continue;
    const band = new THREE.Mesh(bandGeo, bandMat);
    band.position.set(p.x, p.y + 8.6, p.z);
    band.rotation.y = p.heading;
    root.add(band);
  }

  // Ceiling lights and glowing side strips.
  const lightGeo = new THREE.BoxGeometry(0.3, 0.08, 2);
  const count = Math.floor((range.to - range.from) / 10);
  const lights = new THREE.InstancedMesh(lightGeo, toon(0xffffff, { emissive: 0xfff3b0 }), Math.max(1, count));
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const pools: THREE.Matrix4[] = [];
  for (let i = 0; i < count; i++) {
    const s = range.from + 5 + i * 10;
    const p = t.toWorld(s, 0);
    q.setFromAxisAngle(up, p.heading);
    m.compose(new THREE.Vector3(p.x, p.y + (arcade ? 7.5 : 7.9), p.z), q, new THREE.Vector3(1, 1, 1));
    lights.setMatrixAt(i, m);
    if (night) pools.push(poolMatrix(p, t.sample(s).slope));
  }
  lights.count = count;
  root.add(lights);
  // At night the ceiling lights leave pools of light on the road.
  if (night) root.add(glowInstances(poolGeometry(W * 0.75, 0.45), LAMP_LIGHT, pools));
  const strip = toon(0xffb347, { emissive: 0xb86b00, side: THREE.DoubleSide });
  for (const k of [-1, 1]) root.add(new THREE.Mesh(wall(t, k * (W - 0.05), 3, 3.25, range.from, range.to), strip));

  for (let s = range.from - 4; s <= range.to + 4; s += 5) {
    const p = t.toWorld(s, 0);
    obstacles.push({ x: p.x, z: p.z, r: W + 18 });
  }
};

/** Stretch of main road around a bridge where the road is raised above the ground. */
export const bridgeSpan = (world: World, range: Range): Range => {
  const t = world.track;
  let a = range.from;
  while (a > 0 && t.heightAt(a) > 0.4) a -= 1;
  let b = range.to;
  while (b < t.length && t.heightAt(b) > 0.4) b += 1;
  return { from: a, to: b };
};

/** Viaduct: deck edges, underside, railings and pillars. */
export const buildBridge = (world: World, span: Range, root: THREE.Group): void => {
  const t = world.track;
  const hw = world.stage.roadHalfWidth;
  const E = hw + 0.5 + SIDEWALK;
  const concrete = toon(0xd9d4c7, { map: concreteTexture(), side: THREE.DoubleSide });
  for (const k of [-1, 1]) {
    const fascia = new THREE.Mesh(wall(t, k * E, -1.4, 0.24, span.from, span.to, 2, 4), concrete);
    fascia.castShadow = true;
    root.add(fascia);
    root.add(
      new THREE.Mesh(
        wall(t, k * (E - 0.2), 1.15, 1.32, span.from, span.to),
        toon(0xe63946, { side: THREE.DoubleSide }),
      ),
    );
    root.add(
      new THREE.Mesh(
        wall(t, k * (E - 0.2), 0.65, 0.75, span.from, span.to),
        toon(0xf1faee, { side: THREE.DoubleSide }),
      ),
    );
  }
  root.add(
    new THREE.Mesh(ribbon(t, -E, E, -1.4, 3, 8, span.from, span.to), toon(0x8d8a84, { side: THREE.DoubleSide })),
  );

  const postGeo = new THREE.BoxGeometry(0.12, 1.1, 0.12);
  postGeo.translate(0, 0.77, 0);
  const n = Math.floor((span.to - span.from) / 2.5);
  const posts = new THREE.InstancedMesh(postGeo, toon(0xf1faee), n * 2);
  const m = new THREE.Matrix4();
  let i = 0;
  for (let s = span.from; s < span.to && i < n * 2; s += 2.5) {
    for (const k of [-1, 1]) {
      const p = t.toWorld(s, k * (E - 0.2));
      posts.setMatrixAt(i++, m.makeTranslation(p.x, p.y, p.z));
    }
  }
  posts.count = i;
  root.add(posts);

  const pillarGeo = new THREE.CylinderGeometry(0.7, 0.9, 1, 12);
  pillarGeo.translate(0, 0.5, 0);
  const beamGeo = new THREE.BoxGeometry(E * 2 - 1, 1, 1.8);
  const pillarMat = toon(0xc9c1b6, { map: concreteTexture() });
  for (let s = span.from + 10; s <= span.to - 10; s += 18) {
    const y = t.heightAt(s);
    if (y < 2.5) continue;
    for (const k of [-1, 1]) {
      const p = t.toWorld(s, k * (hw - 2));
      const pillar = new THREE.Mesh(pillarGeo, pillarMat);
      pillar.position.set(p.x, -0.05, p.z);
      pillar.scale.y = y - 1.9;
      pillar.castShadow = true;
      root.add(pillar);
    }
    const p = t.toWorld(s, 0);
    const beam = new THREE.Mesh(beamGeo, pillarMat);
    beam.position.set(p.x, y - 2, p.z);
    beam.rotation.y = p.heading;
    beam.castShadow = true;
    root.add(beam);
  }
};

/** River strip with stone banks and a couple of moored boats, or a dry riverbed laid out as a lawn. */
export const buildRiver = (river: River, root: THREE.Group): void => {
  const g = new THREE.Group();
  g.position.set(river.x, 0, river.z);
  g.rotation.y = river.heading;
  const waterGeo = new THREE.PlaneGeometry(river.halfLength * 2, river.halfWidth * 2);
  waterGeo.rotateX(-Math.PI / 2);
  let bed: THREE.Mesh;
  if (river.dry) {
    bed = new THREE.Mesh(waterGeo, toon(PARK_GREEN));
  } else {
    const tex = waterTexture();
    tex.repeat.set(river.halfLength / 10, river.halfWidth / 10);
    bed = new THREE.Mesh(waterGeo, toon(0xffffff, { map: tex }));
  }
  bed.position.y = 0.04;
  bed.receiveShadow = true;
  g.add(bed);
  const bankGeo = new THREE.BoxGeometry(river.halfLength * 2, 0.8, 1.4);
  for (const k of [-1, 1]) {
    const bank = new THREE.Mesh(bankGeo, toon(0x9a8c7a));
    bank.position.set(0, 0.3, k * river.halfWidth);
    g.add(bank);
  }
  for (const [x, z, c] of [
    [-70, -18, 0xe63946],
    [95, 22, 0xffd166],
  ] as const) {
    if (river.dry || Math.abs(x) > river.halfLength - 6 || Math.abs(z) > river.halfWidth - 2) continue;
    const hull = new THREE.Mesh(new THREE.BoxGeometry(9, 1.2, 3), toon(c));
    hull.position.set(x, 0.5, z);
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(3.5, 1.6, 2.2), toon(0xf1faee));
    cabin.position.set(x - 1, 1.9, z);
    hull.castShadow = true;
    cabin.castShadow = true;
    g.add(hull, cabin);
  }
  root.add(g);
};

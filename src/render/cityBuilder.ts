import * as THREE from 'three';
import { Rng } from '../core/rng';
import { inRiver, riverOf } from '../sim/scenery';
import { FACADE_GAP, SIDEWALK } from '../sim/shortcuts';
import type { World } from '../sim/world';
import {
  bridgeSpan,
  buildBridge,
  buildRiver,
  buildShortcut,
  buildTunnel,
  type BuildingRow,
  type Obstacle,
} from './landmarks';
import { toon, withOutline } from './materials';
import { bannerTexture, roadTexture, stripeTexture, tntTexture, windowTexture } from './textures';
import { inRanges, ribbon, segments, wall } from './trackGeometry';

const ROAD_TEX_LENGTH = 16;

export interface CityScene {
  readonly root: THREE.Group;
  /** Shop window meshes, per shortcut, in the same order as `route.panes`. */
  readonly panes: readonly (readonly THREE.Object3D[])[];
  /** Explosive boxes, in the same order as `world.pickups`. */
  readonly pickups: readonly THREE.Object3D[];
}

const gate = (width: number, texture: THREE.Texture): THREE.Group => {
  const g = new THREE.Group();
  const pillarGeo = new THREE.BoxGeometry(0.8, 7, 0.8);
  for (const x of [-width / 2, width / 2]) {
    const p = new THREE.Mesh(pillarGeo, toon(0xf1faee));
    p.position.set(x, 3.5, 0);
    p.castShadow = true;
    g.add(withOutline(p, 0.1));
  }
  const banner = new THREE.Mesh(new THREE.BoxGeometry(width, 1.8, 0.4), [
    toon(0xe63946),
    toon(0xe63946),
    toon(0xe63946),
    toon(0xe63946),
    toon(0xffffff, { map: texture }),
    toon(0xffffff, { map: texture }),
  ]);
  banner.position.y = 7;
  g.add(banner);
  return g;
};

const rampGeometry = (width: number, length: number, height: number): THREE.BufferGeometry => {
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.lineTo(length, 0);
  shape.lineTo(length, height);
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, { depth: width, bevelEnabled: false });
  geo.translate(-length, 0, -width / 2);
  geo.rotateY(-Math.PI / 2);
  return geo;
};

const pickupModel = (tex: THREE.Texture): THREE.Group => {
  const g = new THREE.Group();
  const crate = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.1, 1.1), toon(0xffffff, { map: tex }));
  crate.castShadow = true;
  const inner = withOutline(crate, 0.08);
  inner.name = 'crate';
  const fuse = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.4, 6), toon(0x222222));
  fuse.position.y = 0.75;
  const spark = new THREE.Mesh(new THREE.IcosahedronGeometry(0.12, 0), toon(0xffd166, { emissive: 0xff8800 }));
  spark.position.y = 0.98;
  spark.name = 'spark';
  inner.add(fuse, spark);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.1, 0.07, 6, 24), toon(0xffd166, { emissive: 0xb35900 }));
  ring.rotation.x = Math.PI / 2;
  ring.position.y = -0.75;
  g.add(inner, ring);
  return g;
};

/** Static city scenery for a stage: roads, shortcuts, shops, tunnels, bridges, buildings, props and bonuses. */
export const buildCity = (world: World): CityScene => {
  const { stage, track, routes } = world;
  const hw = stage.roadHalfWidth;
  const L = track.length;
  const root = new THREE.Group();
  root.name = 'city';
  const rng = new Rng(stage.seed);

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(6000, 6000), toon(stage.theme.ground));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.05;
  ground.receiveShadow = true;
  root.add(ground);

  const road = new THREE.Mesh(
    ribbon(track, -hw - 0.5, hw + 0.5, 0.02, 2, ROAD_TEX_LENGTH),
    toon(0xffffff, { map: roadTexture(hw + 0.5, stage.lanes.forward, stage.lanes.oncoming) }),
  );
  road.receiveShadow = true;
  root.add(road);

  const tunnels = stage.tunnels.map((r) => ({ from: r.from * L, to: r.to * L }));
  const spans = stage.bridges.map((r) => bridgeSpan(world, { from: r.from * L, to: r.to * L }));
  const rivers = stage.bridges.map((b) => riverOf(track, b));

  // Sidewalks, curbs and embankments, with gaps where shortcuts branch off.
  const walk = toon(0xd9d4c7);
  const curb = toon(0xa8a39a);
  const skirt = toon(0xb9b2a5, { side: THREE.DoubleSide });
  for (const side of [-1, 1]) {
    const gaps = routes.filter((r) => r.side === side).flatMap((r) => r.mouths);
    const a = side * (hw + 0.5);
    const b = side * (hw + 0.5 + SIDEWALK);
    for (const seg of segments(0, L, gaps)) {
      const sw = new THREE.Mesh(ribbon(track, Math.min(a, b), Math.max(a, b), 0.22, 2, 4, seg.from, seg.to), walk);
      sw.receiveShadow = true;
      root.add(sw);
      const c0 = side < 0 ? a - 0.3 : a;
      root.add(new THREE.Mesh(ribbon(track, c0, c0 + 0.3, 0.26, 2, 4, seg.from, seg.to), curb));
      for (const part of segments(seg.from, seg.to, spans)) {
        root.add(new THREE.Mesh(wall(track, b, 0, 0.22, part.from, part.to, 2, 4, true), skirt));
      }
    }
  }

  // Landmarks.
  const obstacles: Obstacle[] = [];
  const rows: BuildingRow[] = [];
  const panes = routes.map((r) => buildShortcut(world, r, root, obstacles, rows, rng));
  tunnels.forEach((r) => buildTunnel(world, r, root, obstacles));
  spans.forEach((s) => buildBridge(world, s, root));
  rivers.forEach((r) => buildRiver(r, root));
  for (let s = 0; s <= L; s += 6) {
    const p = track.toWorld(s, 0);
    obstacles.push({ x: p.x, z: p.z, r: hw + SIDEWALK + 0.3 });
  }

  // Buildings (instanced), only where the whole footprint is clear of roads, shops, tunnels and water.
  const winTex = windowTexture();
  const bGeo = new THREE.BoxGeometry(1, 1, 1);
  bGeo.translate(0, 0.5, 0);
  const maxBuildings = Math.ceil(L / 8) * 2 + 400;
  const buildings = new THREE.InstancedMesh(bGeo, toon(0xffffff, { map: winTex }), maxBuildings);
  buildings.castShadow = true;
  buildings.receiveShadow = true;
  const roofs = new THREE.InstancedMesh(bGeo, toon(0x6c757d), maxBuildings);
  const footprintClear = (x: number, z: number, h: number, w: number, depth: number): boolean => {
    const fx = Math.sin(h);
    const fz = Math.cos(h);
    const pts: [number, number][] = [];
    for (const u of [-0.5, 0, 0.5])
      for (const v of [-0.5, 0, 0.5]) pts.push([x + fx * u * w - fz * v * depth, z + fz * u * w + fx * v * depth]);
    const reach = Math.hypot(w, depth) / 2;
    return (
      rivers.every((r) => !inRiver(r, x, z, reach + 3)) &&
      obstacles.every((o) => {
        if (Math.abs(o.x - x) > o.r + reach || Math.abs(o.z - z) > o.r + reach) return true;
        return pts.every(([px, pz]) => Math.hypot(px - o.x, pz - o.z) > o.r);
      })
    );
  };

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const color = new THREE.Color();
  let count = 0;
  const propsTrees: THREE.Matrix4[] = [];
  const propsLamps: THREE.Matrix4[] = [];
  const placeRow = (row: BuildingRow): void => {
    const t = world.trackOf(row.route);
    const side = Math.sign(row.offset);
    let s = row.from;
    while (s < row.to && count < maxBuildings) {
      const w = rng.range(10, 20);
      const depth = rng.range(10, 18);
      const h = rng.range(row.minHeight, row.maxHeight);
      const sc = Math.min(Math.max(s + w / 2, 0), t.length);
      const p = t.toWorld(sc, row.offset + side * (depth / 2));
      if (footprintClear(p.x, p.z, p.heading, w, depth)) {
        const top = h + Math.max(0, p.y);
        q.setFromAxisAngle(up, p.heading);
        m.compose(new THREE.Vector3(p.x, -0.05, p.z), q, new THREE.Vector3(w, top, depth));
        buildings.setMatrixAt(count, m);
        color.setHex(rng.pick(stage.theme.buildings));
        buildings.setColorAt(count, color);
        m.compose(new THREE.Vector3(p.x, top - 0.05, p.z), q, new THREE.Vector3(w + 0.6, 0.8, depth + 0.6));
        roofs.setMatrixAt(count, m);
        count++;
      }
      s += w + rng.range(1, 6);
    }
  };
  const mouthsBySide = (side: number) => routes.filter((r) => r.side === side).flatMap((r) => r.mouths);
  for (const side of [-1, 1]) {
    placeRow({
      route: -1,
      from: -30,
      to: L + 30,
      offset: side * (hw + SIDEWALK + FACADE_GAP),
      minHeight: 9,
      maxHeight: 42,
    });
    const gaps = mouthsBySide(side);
    for (let s = 4; s < L; s += rng.range(9, 16)) {
      if (inRanges(s, gaps, 3) || inRanges(s, tunnels, 2)) continue;
      const onBridge = inRanges(s, spans);
      if (rng.next() >= 0.6) continue;
      const pp = track.toWorld(s, side * (hw + 2.8));
      const mat = new THREE.Matrix4().makeTranslation(pp.x, pp.y + 0.2, pp.z);
      (!onBridge && rng.next() < 0.5 ? propsTrees : propsLamps).push(mat);
    }
  }
  rows.forEach(placeRow);
  buildings.count = count;
  roofs.count = count;
  root.add(buildings, roofs);

  const trunkGeo = new THREE.CylinderGeometry(0.15, 0.2, 2, 6);
  trunkGeo.translate(0, 1, 0);
  const crownGeo = new THREE.IcosahedronGeometry(1.4, 0);
  crownGeo.translate(0, 3, 0);
  const trunks = new THREE.InstancedMesh(trunkGeo, toon(0x8d5524), propsTrees.length);
  const crowns = new THREE.InstancedMesh(crownGeo, toon(0x52b788), propsTrees.length);
  crowns.castShadow = true;
  propsTrees.forEach((mt, i) => {
    trunks.setMatrixAt(i, mt);
    crowns.setMatrixAt(i, mt);
  });
  const poleGeo = new THREE.CylinderGeometry(0.08, 0.1, 5, 6);
  poleGeo.translate(0, 2.5, 0);
  const bulbGeo = new THREE.SphereGeometry(0.3, 8, 6);
  bulbGeo.translate(0, 5.1, 0);
  const poles = new THREE.InstancedMesh(poleGeo, toon(0x495057), propsLamps.length);
  const bulbs = new THREE.InstancedMesh(bulbGeo, toon(0xfff3b0, { emissive: 0x80704a }), propsLamps.length);
  propsLamps.forEach((mt, i) => {
    poles.setMatrixAt(i, mt);
    bulbs.setMatrixAt(i, mt);
  });
  root.add(trunks, crowns, poles, bulbs);

  // Checkpoint gates + finish.
  const cpTex = bannerTexture('CHECKPOINT');
  const addGate = (s: number, tex: THREE.Texture): void => {
    const g = gate(hw * 2 + 1.5, tex);
    const p = track.toWorld(s, 0);
    g.position.set(p.x, p.y, p.z);
    g.rotation.y = p.heading;
    root.add(g);
  };
  for (const cp of world.rules.checkpoints) addGate(cp.s, cpTex);
  addGate(world.rules.finishS, bannerTexture('FINISH', true));
  addGate(8, bannerTexture('START', true));

  // Ramps.
  const stripes = stripeTexture();
  for (const r of world.ramps) {
    const ramp = new THREE.Mesh(rampGeometry(r.width, 4, 1), toon(0xffffff, { map: stripes }));
    const p = track.toWorld(r.s, r.d);
    ramp.position.set(p.x, p.y, p.z);
    ramp.rotation.y = p.heading;
    ramp.castShadow = true;
    ramp.receiveShadow = true;
    root.add(ramp);
  }

  // Explosive bonus boxes.
  const tnt = tntTexture();
  const pickups = world.pickups.map((pk) => {
    const g = pickupModel(tnt);
    const p = world.trackOf(pk.route).toWorld(pk.s, pk.d);
    g.position.set(p.x, p.y + 0.95, p.z);
    root.add(g);
    return g;
  });

  return { root, panes, pickups };
};

import * as THREE from 'three';
import { Rng } from '../core/rng';
import { MONUMENTS } from '../content/monuments';
import { DEFAULT_TRAFFIC_MIX } from '../content/vehicles';
import { inPolygon, inRiver, polygonDistance, railOf, riverOf } from '../sim/scenery';
import { laneFits, NARROW_TAPER } from '../sim/roadWidth';
import { FACADE_GAP, SIDEWALK } from '../sim/shortcuts';
import type { PickupKind } from '../sim/events';
import type { World } from '../sim/world';
import {
  bridgeSpan,
  buildBridge,
  buildRiver,
  buildShortcut,
  buildTunnel,
  PARK_GREEN,
  type BuildingRow,
  type Obstacle,
} from './landmarks';
import { toon, withOutline } from './materials';
import { monumentModel } from './monuments';
import { coneGeometry, glowInstances, LAMP_LIGHT, poolGeometry, poolMatrix } from './nightLights';
import {
  buildCrossing,
  buildPark,
  buildSea,
  LOOKS,
  obstacleModel,
  treeGeometries,
  umbrellaModel,
  type CrossingScene,
} from './sceneryStyle';
import {
  bannerTexture,
  roadTexture,
  shedTexture,
  stripeTexture,
  tntTexture,
  turboTexture,
  windowTextures,
} from './textures';
import { inRanges, ribbon, segments, sweep, wall, widened } from './trackGeometry';

const ROAD_TEX_LENGTH = 16;

export interface CityScene {
  readonly root: THREE.Group;
  /** Shop window meshes, per shortcut, in the same order as `route.panes`. */
  readonly panes: readonly (readonly THREE.Object3D[])[];
  /** Bonus boxes, in the same order as `world.pickups`. */
  readonly pickups: readonly THREE.Object3D[];
  /** Road obstacles, in the same order as `world.obstacles`. */
  readonly obstacles: readonly THREE.Object3D[];
  /** Level crossings, in the same order as `world.crossings`. */
  readonly crossings: readonly CrossingScene[];
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

const pickupModel = (tex: THREE.Texture, kind: PickupKind): THREE.Group => {
  const g = new THREE.Group();
  const crate = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.1, 1.1), toon(0xffffff, { map: tex }));
  crate.castShadow = true;
  const inner = withOutline(crate, 0.08);
  inner.name = 'crate';
  if (kind === 'turbo') {
    // A little rocket on top, with its flame pulsing.
    const rocket = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.4, 10), toon(0xe63946));
    rocket.position.y = 0.8;
    const flame = new THREE.Mesh(new THREE.IcosahedronGeometry(0.12, 0), toon(0xffd166, { emissive: 0xff5500 }));
    flame.position.y = 0.55;
    flame.name = 'spark';
    inner.add(rocket, flame);
  } else {
    const fuse = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.4, 6), toon(0x222222));
    fuse.position.y = 0.75;
    const spark = new THREE.Mesh(new THREE.IcosahedronGeometry(0.12, 0), toon(0xffd166, { emissive: 0xff8800 }));
    spark.position.y = 0.98;
    spark.name = 'spark';
    inner.add(fuse, spark);
  }
  const ringColor = kind === 'turbo' ? 0x4cc9f0 : 0xffd166;
  const ringGlow = kind === 'turbo' ? 0x0077b6 : 0xb35900;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.1, 0.07, 6, 24), toon(ringColor, { emissive: ringGlow }));
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
  const look = LOOKS[stage.scenery];
  const mix = stage.trafficMix ?? DEFAULT_TRAFFIC_MIX;
  const night = stage.theme.night ?? false;

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(6000, 6000), toon(stage.theme.ground));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.05;
  ground.receiveShadow = true;
  root.add(ground);

  // The city follows the carriageway where narrow streets squeeze it.
  const street = widened(track, (s) => world.halfWidthAt(s), hw);
  const lanes = [...stage.lanes.forward, ...stage.lanes.oncoming];
  const rails = (mix.tram ?? 0) > 0 ? lanes : [];
  const narrowRanges = world.narrows.map((n) => ({ from: n.from - NARROW_TAPER, to: n.to + NARROW_TAPER }));
  const roadMat = toon(0xffffff, {
    map: roadTexture(hw + 0.5, stage.lanes.forward, stage.lanes.oncoming, { cobbles: look.cobbles, rails }),
  });
  for (const seg of segments(0, L, narrowRanges)) {
    const road = new THREE.Mesh(
      ribbon(track, -hw - 0.5, hw + 0.5, 0.02, 2, ROAD_TEX_LENGTH, seg.from, seg.to),
      roadMat,
    );
    road.receiveShadow = true;
    root.add(road);
  }
  // Narrow streets: one lane each way over setts, the painted lines following the taper.
  for (const n of world.narrows) {
    const open = (ds: readonly number[]): number[] => ds.filter((d) => laneFits(d, n.halfWidth));
    const tex = roadTexture(n.halfWidth + 0.5, open(stage.lanes.forward), open(stage.lanes.oncoming), {
      cobbles: true,
      rails: rails.filter((d) => laneFits(d, n.halfWidth)),
    });
    const geo = ribbon(
      street,
      -hw - 0.5,
      hw + 0.5,
      0.02,
      1,
      ROAD_TEX_LENGTH,
      n.from - NARROW_TAPER,
      n.to + NARROW_TAPER,
    );
    const road = new THREE.Mesh(geo, toon(0xffffff, { map: tex }));
    road.receiveShadow = true;
    root.add(road);
  }

  const tunnels = stage.tunnels.map((r) => ({ from: r.from * L, to: r.to * L }));
  const spans = stage.bridges.map((r) => bridgeSpan(world, { from: r.from * L, to: r.to * L }));
  const rivers = [
    ...stage.bridges.map((b) => riverOf(track, b)),
    ...(stage.crossings ?? []).map((c) => railOf(track, c.at)),
  ];

  // Sidewalks, curbs and embankments, with gaps where shortcuts branch off.
  const walk = toon(look.sidewalk);
  const curb = toon(look.curb);
  const skirt = toon(0xb9b2a5, { side: THREE.DoubleSide });
  const bank = toon(stage.theme.ground, { side: THREE.DoubleSide });
  const rail = toon(0xc9ced4, { side: THREE.DoubleSide });
  for (const side of [-1, 1]) {
    const gaps = routes.filter((r) => r.side === side).flatMap((r) => r.mouths);
    const a = side * (hw + 0.5);
    const b = side * (hw + 0.5 + SIDEWALK);
    for (const seg of segments(0, L, gaps)) {
      const sw = new THREE.Mesh(ribbon(street, Math.min(a, b), Math.max(a, b), 0.22, 2, 4, seg.from, seg.to), walk);
      sw.receiveShadow = true;
      root.add(sw);
      const c0 = side < 0 ? a - 0.3 : a;
      root.add(new THREE.Mesh(ribbon(street, c0, c0 + 0.3, 0.26, 2, 4, seg.from, seg.to), curb));
      for (const part of segments(seg.from, seg.to, spans)) {
        if (look.guardrails) {
          // Country road: grassy embankment sloping down from the shoulder.
          const bankGeo = sweep(
            street,
            [side < 0 ? [b - 16, 0] : [b, 0.22], side < 0 ? [b, 0.22] : [b + 16, 0]],
            part.from,
            part.to,
            2,
            8,
            side < 0 ? [true, false] : [false, true],
          );
          root.add(new THREE.Mesh(bankGeo, bank));
        } else {
          root.add(new THREE.Mesh(wall(street, b, 0, 0.22, part.from, part.to, 2, 4, true), skirt));
        }
      }
      if (look.guardrails) {
        const g0 = side * (hw + 0.5 + SIDEWALK - 0.3);
        root.add(new THREE.Mesh(wall(street, g0, 0.5, 0.85, seg.from, seg.to, 2, 4), rail));
      }
    }
  }

  // Landmarks.
  const obstacles: Obstacle[] = [];
  const rows: BuildingRow[] = [];
  const panes = routes.map((r) => buildShortcut(world, r, root, obstacles, rows, rng));
  tunnels.forEach((r) => buildTunnel(world, r, root, obstacles, look.tunnel));
  spans.forEach((s) => buildBridge(world, s, root));
  stage.bridges.forEach((b) => buildRiver(riverOf(track, b), root));
  const crossings = world.crossings.map((c) => buildCrossing(track, c.s, hw, root));
  if (stage.sea) buildSea(stage.sea, root);
  const sea = stage.sea;
  const parks = stage.parks ?? [];
  parks.forEach((poly) => buildPark(poly, PARK_GREEN, root));
  for (let s = 0; s <= L; s += 6) {
    const p = track.toWorld(s, 0);
    obstacles.push({ x: p.x, z: p.z, r: world.halfWidthAt(s) + SIDEWALK + 0.3 });
  }
  // Monuments, facing the road, with the buildings kept out of their footprint.
  for (const mon of stage.monuments ?? []) {
    const p = track.toWorld(mon.at * L, mon.d);
    const g = monumentModel(mon.kind);
    g.position.set(p.x, p.y + (mon.d === 0 ? 0 : -0.05), p.z);
    g.rotation.y = p.heading + Math.sign(mon.d) * (Math.PI / 2);
    root.add(g);
    obstacles.push({ x: p.x, z: p.z, r: MONUMENTS[mon.kind].radius });
  }

  // Buildings (instanced), only where the whole footprint is clear of roads, shops, tunnels and water.

  const bGeo = new THREE.BoxGeometry(1, 1, 1);
  bGeo.translate(0, 0.5, 0);
  const maxBuildings = Math.ceil(L / 8) * 2 + 400;
  const facade = look.sheds ? { map: shedTexture(), glow: null } : windowTextures();
  const buildings = new THREE.InstancedMesh(
    bGeo,
    toon(
      0xffffff,
      night && facade.glow ? { map: facade.map, emissive: 0xffffff, emissiveMap: facade.glow } : { map: facade.map },
    ),
    maxBuildings,
  );
  buildings.castShadow = true;
  buildings.receiveShadow = true;
  const roofs = new THREE.InstancedMesh(bGeo, toon(look.roof), maxBuildings);
  const containerGeo = new THREE.BoxGeometry(2.5, 2.6, 12);
  containerGeo.translate(0, 1.3, 0);
  const maxContainers = look.containers ? 600 : 0;
  const containers = new THREE.InstancedMesh(containerGeo, toon(0xffffff), Math.max(1, maxContainers));
  containers.castShadow = true;
  let containerCount = 0;
  const CONTAINER_COLORS = [0xc8553d, 0x2a9d8f, 0x264653, 0xe9c46a, 0x3a86ff, 0x8d99ae];
  /** Stacks of shipping containers filling a building plot. */
  const placeContainers = (x: number, z: number, heading: number, w: number, depth: number): void => {
    q.setFromAxisAngle(up, heading + Math.PI / 2);
    const cols = Math.max(1, Math.floor(w / 2.8));
    const rowsN = Math.max(1, Math.floor(depth / 12.5));
    for (let i = 0; i < cols; i++) {
      for (let j = 0; j < rowsN; j++) {
        const levels = rng.int(1, 3);
        for (let k = 0; k < levels && containerCount < maxContainers; k++) {
          const u = (i - (cols - 1) / 2) * 2.8;
          const v = (j - (rowsN - 1) / 2) * 12.5;
          const px = x + Math.sin(heading) * u + Math.cos(heading) * v;
          const pz = z + Math.cos(heading) * u - Math.sin(heading) * v;
          m.compose(new THREE.Vector3(px, -0.05 + k * 2.6, pz), q, new THREE.Vector3(1, 1, 1));
          containers.setMatrixAt(containerCount, m);
          color.setHex(rng.pick(CONTAINER_COLORS));
          containers.setColorAt(containerCount, color);
          containerCount++;
        }
      }
    }
  };
  const footprintClear = (x: number, z: number, h: number, w: number, depth: number): boolean => {
    const fx = Math.sin(h);
    const fz = Math.cos(h);
    const pts: [number, number][] = [];
    for (const u of [-0.5, 0, 0.5])
      for (const v of [-0.5, 0, 0.5]) pts.push([x + fx * u * w - fz * v * depth, z + fz * u * w + fx * v * depth]);
    const reach = Math.hypot(w, depth) / 2;
    return (
      rivers.every((r) => !inRiver(r, x, z, reach + 3)) &&
      (!sea || polygonDistance(sea, x, z) > reach + 25) &&
      parks.every((poly) => polygonDistance(poly, x, z) > reach + 2) &&
      obstacles.every((o) => {
        if (Math.abs(o.x - x) > o.r + reach || Math.abs(o.z - z) > o.r + reach) return true;
        return pts.every(([px, pz]) => Math.hypot(px - o.x, pz - o.z) > o.r);
      })
    );
  };

  /** Whether a small prop fits at a point (off roads, water and landmarks; parks allowed). */
  const pointFree = (x: number, z: number, r: number): boolean =>
    rivers.every((rv) => !inRiver(rv, x, z, r)) && obstacles.every((o) => Math.hypot(o.x - x, o.z - z) > o.r + r);

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const color = new THREE.Color();
  let count = 0;
  const propsTrees: THREE.Matrix4[] = [];
  const propsLamps: THREE.Matrix4[] = [];
  /** Light pools on the road next to each street lamp (night only). */
  const lampPools: THREE.Matrix4[] = [];
  const placeRow = (row: BuildingRow): void => {
    const t = row.route < 0 ? street : world.trackOf(row.route);
    const side = Math.sign(row.offset);
    let s = row.from;
    while (s < row.to && count < maxBuildings) {
      const w = rng.range(look.buildingWidth[0], look.buildingWidth[1]);
      const depth = rng.range(look.buildingDepth[0], look.buildingDepth[1]);
      const h = rng.range(row.minHeight, row.maxHeight);
      const sc = Math.min(Math.max(s + w / 2, 0), t.length);
      const p = t.toWorld(sc, row.offset + side * (depth / 2));
      if (look.containers && footprintClear(p.x, p.z, p.heading, w, depth) && rng.next() < 0.3) {
        placeContainers(p.x, p.z, p.heading, w, depth);
      } else if (footprintClear(p.x, p.z, p.heading, w, depth)) {
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
      s += w + rng.range(look.rowGap[0], look.rowGap[1]);
    }
  };
  const mouthsBySide = (side: number) => routes.filter((r) => r.side === side).flatMap((r) => r.mouths);
  for (const side of [-1, 1]) {
    placeRow({
      route: -1,
      from: -30,
      to: L + 30,
      offset: side * (hw + SIDEWALK + FACADE_GAP + look.setback),
      minHeight: look.mainHeight[0],
      maxHeight: look.mainHeight[1],
    });
    const gaps = mouthsBySide(side);
    for (let s = 4; s < L; s += rng.range(9, 16)) {
      if (inRanges(s, gaps, 3) || inRanges(s, tunnels, 2)) continue;
      const onBridge = inRanges(s, spans);
      if (rng.next() >= look.propChance) continue;
      const pp = street.toWorld(s, side * (hw + 2.8));
      const mat = new THREE.Matrix4().makeTranslation(pp.x, pp.y + 0.2, pp.z);
      const tree = !onBridge && rng.next() < look.treeChance;
      if (tree || !look.guardrails) (tree ? propsTrees : propsLamps).push(mat);
      if (night && !tree && !look.guardrails)
        lampPools.push(poolMatrix(street.toWorld(s, side * (hw - 0.5)), track.sample(s).slope));
    }
  }
  rows.forEach((r) => placeRow({ ...r, minHeight: look.routeHeight[0], maxHeight: look.routeHeight[1] }));
  buildings.count = count;
  roofs.count = count;
  root.add(buildings, roofs);
  containers.count = containerCount;
  if (containerCount > 0) root.add(containers);

  const [trunkGeo, crownGeo, crownColor, fruitGeo] = treeGeometries(look.tree);
  const trunks = new THREE.InstancedMesh(trunkGeo, toon(0x8d5524), propsTrees.length);
  const crowns = new THREE.InstancedMesh(crownGeo, toon(crownColor), propsTrees.length);
  crowns.castShadow = true;
  const fruit = fruitGeo && new THREE.InstancedMesh(fruitGeo, toon(0xff8c1a), propsTrees.length);
  propsTrees.forEach((mt, i) => {
    trunks.setMatrixAt(i, mt);
    crowns.setMatrixAt(i, mt);
    fruit?.setMatrixAt(i, mt);
  });
  if (fruit) root.add(fruit);
  const poleGeo = new THREE.CylinderGeometry(0.08, 0.1, 5, 6);
  poleGeo.translate(0, 2.5, 0);
  const bulbGeo = new THREE.SphereGeometry(0.3, 8, 6);
  bulbGeo.translate(0, 5.1, 0);
  const poles = new THREE.InstancedMesh(poleGeo, toon(0x495057), propsLamps.length);
  const bulbs = new THREE.InstancedMesh(
    bulbGeo,
    toon(0xfff3b0, { emissive: night ? 0xfff3b0 : 0x80704a }),
    propsLamps.length,
  );
  propsLamps.forEach((mt, i) => {
    poles.setMatrixAt(i, mt);
    bulbs.setMatrixAt(i, mt);
  });
  root.add(trunks, crowns, poles, bulbs);
  if (night) {
    root.add(
      glowInstances(coneGeometry(0.3, 3.2, 5, 0.22), LAMP_LIGHT, propsLamps),
      glowInstances(poolGeometry(5, 0.5), LAMP_LIGHT, lampPools),
    );
  }

  // Beach umbrellas on the sand between the road and the sea.
  if (sea) {
    const colors = [0xe63946, 0xffd166, 0x3a86ff, 0x06d6a0, 0xff70a6];
    for (let s = 20; s < L; s += rng.range(14, 26)) {
      for (const side of [-1, 1]) {
        const away = hw + SIDEWALK + rng.range(8, 30);
        const p = track.toWorld(s, side * away);
        const dSea = polygonDistance(sea, p.x, p.z);
        if (dSea < 4 || dSea > 24 || !footprintClear(p.x, p.z, 0, 2, 2)) continue;
        const u = umbrellaModel(rng.pick(colors));
        u.position.set(p.x, 0, p.z);
        u.rotation.y = rng.range(0, Math.PI * 2);
        root.add(u);
      }
    }
  }

  // Palm trees scattered over the park lawns (clear of paths, water and monuments).
  if (parks.length > 0) {
    const [trunkGeo, crownGeo, crownColor] = treeGeometries('palm');
    const palms: THREE.Matrix4[] = [];
    for (const poly of parks) {
      const xs = poly.map((p) => p[0]);
      const zs = poly.map((p) => p[1]);
      const [x0, x1, z0, z1] = [Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs)];
      const tries = Math.min(4000, Math.ceil(((x1 - x0) * (z1 - z0)) / 150));
      for (let i = 0; i < tries && palms.length < 700; i++) {
        const x = rng.range(x0, x1);
        const z = rng.range(z0, z1);
        if (!inPolygon(poly, x, z) || !pointFree(x, z, 2)) continue;
        const scale = new THREE.Vector3(1, rng.range(0.9, 1.5), 1);
        palms.push(new THREE.Matrix4().compose(new THREE.Vector3(x, 0, z), new THREE.Quaternion(), scale));
      }
    }
    const trunks = new THREE.InstancedMesh(trunkGeo, toon(0x8d5524), palms.length);
    const crowns = new THREE.InstancedMesh(crownGeo, toon(crownColor), palms.length);
    crowns.castShadow = true;
    palms.forEach((mt, i) => {
      trunks.setMatrixAt(i, mt);
      crowns.setMatrixAt(i, mt);
    });
    root.add(trunks, crowns);
  }

  // Tower cranes over the industrial estate.
  if (look.containers) {
    const yellow = toon(0xffc300);
    for (let s = 150, placed = 0; s < L && placed < 5; s += 70) {
      const side = placed % 2 ? 1 : -1;
      const p = track.toWorld(s, side * (hw + 45));
      if (!footprintClear(p.x, p.z, 0, 4, 4)) continue;
      const crane = new THREE.Group();
      const mast = new THREE.Mesh(new THREE.BoxGeometry(1.6, 42, 1.6), yellow);
      mast.position.y = 21;
      const jib = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.2, 38), yellow);
      jib.position.set(0, 42, 10);
      const counter = new THREE.Mesh(new THREE.BoxGeometry(2.4, 2, 5), toon(0x495057));
      counter.position.set(0, 41.5, -9);
      const cable = new THREE.Mesh(new THREE.BoxGeometry(0.06, 16, 0.06), toon(0x222222));
      cable.position.set(0, 34, 22);
      mast.castShadow = true;
      jib.castShadow = true;
      crane.add(mast, jib, counter, cable);
      crane.position.set(p.x, -0.05, p.z);
      crane.rotation.y = rng.range(0, Math.PI * 2);
      root.add(crane);
      placed++;
    }
  }

  // Road obstacles.
  const obstacleModels = world.obstacles.map((o) => {
    const g = obstacleModel(o.kind);
    const p = track.toWorld(o.s, o.d);
    g.position.set(p.x, p.y, p.z);
    g.rotation.y = p.heading;
    root.add(g);
    return g;
  });

  // Checkpoint gates + finish.
  const cpTex = bannerTexture('CHECKPOINT');
  const addGate = (s: number, tex: THREE.Texture): void => {
    const g = gate(world.halfWidthAt(s) * 2 + 1.5, tex);
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

  // Bonus boxes (explosives and turbo).
  const tnt = tntTexture();
  const turbo = turboTexture();
  const pickups = world.pickups.map((pk) => {
    const g = pickupModel(pk.kind === 'turbo' ? turbo : tnt, pk.kind);
    const p = world.trackOf(pk.route).toWorld(pk.s, pk.d);
    g.position.set(p.x, p.y + 0.95, p.z);
    root.add(g);
    return g;
  });

  return { root, panes, pickups, obstacles: obstacleModels, crossings };
};

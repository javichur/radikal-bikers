import * as THREE from 'three';
import { Rng } from '../core/rng';
import type { World } from '../sim/world';
import { canvasTexture, toon, withOutline } from './materials';

const SIDEWALK = 4.5;
const ROAD_TEX_LENGTH = 16;

const roadTexture = (halfWidth: number, forward: readonly number[], oncoming: readonly number[]): THREE.Texture => {
  const W = 512;
  const H = 256;
  const tex = canvasTexture(W, H, (c) => {
    c.fillStyle = '#3b3f4a';
    c.fillRect(0, 0, W, H);
    for (let i = 0; i < 900; i++) {
      c.fillStyle = `rgba(255,255,255,${Math.random() * 0.05})`;
      c.fillRect(Math.random() * W, Math.random() * H, 2, 2);
    }
    const x = (d: number): number => ((d + halfWidth) / (halfWidth * 2)) * W;
    // Edge lines.
    c.fillStyle = '#f1f1f1';
    c.fillRect(x(-halfWidth + 0.3), 0, 6, H);
    c.fillRect(x(halfWidth - 0.3) - 6, 0, 6, H);
    // Double yellow centre line.
    c.fillStyle = '#ffd166';
    c.fillRect(x(0) - 9, 0, 6, H);
    c.fillRect(x(0) + 3, 0, 6, H);
    // Dashed lane separators.
    c.fillStyle = '#f1f1f1';
    const seps = [...forward, ...oncoming]
      .sort((a, b) => a - b)
      .reduce<number[]>((acc, d, i, arr) => {
        const next = arr[i + 1];
        if (next !== undefined && Math.sign(d) === Math.sign(next)) acc.push((d + next) / 2);
        return acc;
      }, []);
    for (const d of seps) c.fillRect(x(d) - 3, 0, 6, H * 0.5);
  });
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
};

const windowTexture = (): THREE.Texture => {
  const tex = canvasTexture(128, 256, (c) => {
    c.fillStyle = '#ffffff';
    c.fillRect(0, 0, 128, 256);
    for (let y = 12; y < 250; y += 28) {
      for (let x = 10; x < 120; x += 28) {
        c.fillStyle = Math.random() < 0.25 ? '#fff3c4' : '#5b6b8c';
        c.fillRect(x, y, 16, 16);
      }
    }
    c.fillStyle = 'rgba(0,0,0,0.15)';
    c.fillRect(0, 250, 128, 6);
  });
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
};

const bannerTexture = (text: string, checkered = false): THREE.Texture =>
  canvasTexture(512, 96, (c) => {
    if (checkered) {
      for (let x = 0; x < 512; x += 24)
        for (let y = 0; y < 96; y += 24) {
          c.fillStyle = (x + y) % 48 === 0 ? '#111' : '#fff';
          c.fillRect(x, y, 24, 24);
        }
      c.fillStyle = 'rgba(230,57,70,0.9)';
      c.fillRect(96, 16, 320, 64);
    } else {
      c.fillStyle = '#e63946';
      c.fillRect(0, 0, 512, 96);
      c.fillStyle = '#ffd166';
      c.fillRect(0, 0, 512, 8);
      c.fillRect(0, 88, 512, 8);
    }
    c.fillStyle = '#fff';
    c.font = 'bold 56px "Trebuchet MS", sans-serif';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(text, 256, 50);
  });

/** Builds a ribbon mesh following the track between lateral offsets d0..d1. */
const ribbon = (
  world: World,
  d0: number,
  d1: number,
  lift: number,
  step: number,
  vScale: number,
): THREE.BufferGeometry => {
  const { track } = world;
  const n = Math.floor(track.length / step) + 1;
  const pos = new Float32Array(n * 2 * 3);
  const uv = new Float32Array(n * 2 * 2);
  const idx: number[] = [];
  for (let i = 0; i < n; i++) {
    const s = Math.min(i * step, track.length);
    const a = track.toWorld(s, d0);
    const b = track.toWorld(s, d1);
    pos.set([a.x, a.y + lift, a.z, b.x, b.y + lift, b.z], i * 6);
    uv.set([0, s / vScale, 1, s / vScale], i * 4);
    if (i > 0) {
      const k = i * 2;
      idx.push(k - 2, k - 1, k, k - 1, k + 1, k);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
};

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

const stripeTexture = (): THREE.Texture => {
  const t = canvasTexture(64, 64, (c) => {
    c.fillStyle = '#ffd166';
    c.fillRect(0, 0, 64, 64);
    c.fillStyle = '#222';
    for (let i = -64; i < 128; i += 22) {
      c.beginPath();
      c.moveTo(i, 0);
      c.lineTo(i + 11, 0);
      c.lineTo(i + 75, 64);
      c.lineTo(i + 64, 64);
      c.fill();
    }
  });
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  return t;
};

/** Static city scenery for a stage: road, sidewalks, buildings, props, gates, ramps. */
export const buildCity = (world: World): THREE.Group => {
  const { stage, track } = world;
  const hw = stage.roadHalfWidth;
  const root = new THREE.Group();
  root.name = 'city';

  // Ground.
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(6000, 6000), toon(stage.theme.ground));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.05;
  ground.receiveShadow = true;
  root.add(ground);

  // Road.
  const road = new THREE.Mesh(
    ribbon(world, -hw - 0.5, hw + 0.5, 0.02, 2, ROAD_TEX_LENGTH),
    toon(0xffffff, { map: roadTexture(hw + 0.5, stage.lanes.forward, stage.lanes.oncoming) }),
  );
  road.receiveShadow = true;
  root.add(road);

  // Sidewalks + curbs.
  const walk = toon(0xd9d4c7);
  const curb = toon(0xa8a39a);
  for (const side of [-1, 1]) {
    const a = side * (hw + 0.5);
    const b = side * (hw + 0.5 + SIDEWALK);
    const sw = new THREE.Mesh(ribbon(world, side < 0 ? b : a, side < 0 ? a : b, 0.22, 2, 4), walk);
    sw.receiveShadow = true;
    root.add(sw);
    const cb = new THREE.Mesh(ribbon(world, side < 0 ? a - 0.3 : a, side < 0 ? a : a + 0.3, 0.26, 2, 4), curb);
    root.add(cb);
  }

  // Buildings (instanced), skipping any that would intrude on the road.
  const rng = new Rng(stage.seed);
  const winTex = windowTexture();
  const bGeo = new THREE.BoxGeometry(1, 1, 1);
  bGeo.translate(0, 0.5, 0);
  const maxBuildings = Math.ceil(track.length / 12) * 2;
  const buildings = new THREE.InstancedMesh(bGeo, toon(0xffffff, { map: winTex }), maxBuildings);
  buildings.castShadow = true;
  buildings.receiveShadow = true;
  const roofs = new THREE.InstancedMesh(bGeo, toon(0x6c757d), maxBuildings);
  const probe: { x: number; z: number }[] = [];
  for (let s = 0; s <= track.length; s += 6) probe.push(track.toWorld(s, 0));
  const clearOfRoad = (x: number, z: number, r: number): boolean =>
    probe.every((p) => Math.hypot(p.x - x, p.z - z) > hw + SIDEWALK + r);

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const color = new THREE.Color();
  let count = 0;
  const propsTrees: THREE.Matrix4[] = [];
  const propsLamps: THREE.Matrix4[] = [];
  for (const side of [-1, 1]) {
    let s = -30;
    while (s < track.length + 30 && count < maxBuildings) {
      const w = rng.range(10, 20);
      const depth = rng.range(10, 18);
      const h = rng.range(9, 42);
      const sc = s + w / 2;
      const off = side * (hw + SIDEWALK + 1.5 + depth / 2);
      const p = track.toWorld(Math.min(Math.max(sc, 0), track.length), off);
      if (clearOfRoad(p.x, p.z, Math.hypot(w, depth) / 2 - 1.5)) {
        q.setFromAxisAngle(up, p.heading);
        m.compose(new THREE.Vector3(p.x, p.y, p.z), q, new THREE.Vector3(w, h, depth));
        buildings.setMatrixAt(count, m);
        color.setHex(rng.pick(stage.theme.buildings));
        buildings.setColorAt(count, color);
        m.compose(new THREE.Vector3(p.x, p.y + h, p.z), q, new THREE.Vector3(w + 0.6, 0.8, depth + 0.6));
        roofs.setMatrixAt(count, m);
        count++;
      }
      if (rng.next() < 0.6 && sc > 0 && sc < track.length) {
        const pp = track.toWorld(s, side * (hw + 2.8));
        const mat = new THREE.Matrix4().makeTranslation(pp.x, pp.y + 0.2, pp.z);
        (rng.next() < 0.5 ? propsTrees : propsLamps).push(mat);
      }
      s += w + rng.range(1, 6);
    }
  }
  buildings.count = count;
  roofs.count = count;
  root.add(buildings, roofs);

  // Trees.
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
  // Lamps.
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
    const len = 4;
    const ramp = new THREE.Mesh(rampGeometry(r.width, len, 1), toon(0xffffff, { map: stripes }));
    const p = track.toWorld(r.s, r.d);
    ramp.position.set(p.x, p.y, p.z);
    ramp.rotation.y = p.heading;
    ramp.castShadow = true;
    ramp.receiveShadow = true;
    root.add(ramp);
  }

  return root;
};

import * as THREE from 'three';
import type { VehicleKind } from '../content/vehicles';
import { VEHICLES } from '../content/vehicles';
import { toon, withOutline } from './materials';
import { beamGeometry, glowMaterial, HEADLIGHT, poolGeometry, TAIL_LIGHT } from './nightLights';

const PALETTE = [0xef476f, 0x118ab2, 0x06d6a0, 0xf78c6b, 0x8338ec, 0xffffff, 0x3a86ff, 0x8d99ae];
const GLASS = 0x2d3a5a;

/** Warm cabin light seen through bus and tram windows at night. */
const LIT_WINDOWS = 0xffe8a3;

const part = (w: number, h: number, d: number, color: number, x: number, y: number, z: number): THREE.Group => {
  const m = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    toon(color, color === LIT_WINDOWS ? { emissive: 0xb89a4a } : {}),
  );
  m.position.set(x, y, z);
  m.castShadow = true;
  return withOutline(m, 0.08);
};

const DARK = 0x333333;
const CHROME = 0xced4da;

const wheels = (g: THREE.Group, width: number, length: number, r: number, axles?: readonly number[]): void => {
  const geo = new THREE.CylinderGeometry(r, r, 0.3, 12);
  geo.rotateZ(Math.PI / 2);
  const mat = toon(0x1b1b1b);
  for (const z of axles ?? [-length * 0.34, length * 0.34]) {
    for (const x of [-width / 2 + 0.1, width / 2 - 0.1]) {
      const w = new THREE.Mesh(geo, mat);
      w.position.set(x, r, z);
      g.add(w);
    }
  }
};

/** Glass pane on the front (+1) or rear (-1) face of a body ending at `zFace`. */
const pane = (w: number, h: number, y: number, zFace: number, side: 1 | -1, color = GLASS): THREE.Group =>
  part(w, h, 0.06, color, 0, y, zFace + side * 0.03);

/** Pair of side windows (one per flank) centred at `z`. */
const sideWindows = (g: THREE.Group, bodyW: number, d: number, h: number, y: number, z: number): void => {
  for (const x of [-bodyW / 2 - 0.02, bodyW / 2 + 0.02]) g.add(part(0.05, h, d, GLASS, x, y, z));
};

/** Stripe along both flanks. */
const stripe = (g: THREE.Group, bodyW: number, d: number, h: number, color: number, y: number, z: number): void => {
  for (const x of [-bodyW / 2 - 0.02, bodyW / 2 + 0.02]) g.add(part(0.05, h, d, color, x, y, z));
};

const BEACON = {
  red: toon(0xff2233, { emissive: 0xaa0000 }),
  blue: toon(0x3a86ff, { emissive: 0x1144aa }),
  amber: toon(0xffb703, { emissive: 0x885500 }),
};

/**
 * Roof light bar whose two halves flash alternately (see `flashBeacons`).
 * Both halves use `b` for single-colour beacons such as the refuse truck's amber one.
 */
const lightBar = (
  g: THREE.Group,
  width: number,
  y: number,
  z: number,
  a: THREE.Material,
  b: THREE.Material = a,
): void => {
  g.add(part(width, 0.1, 0.3, DARK, 0, y, z));
  const geo = new THREE.BoxGeometry(width * 0.42, 0.16, 0.26);
  const halves = [a, b].map((mat, i) => {
    const lamp = new THREE.Mesh(geo, mat);
    lamp.position.set((i === 0 ? -1 : 1) * width * 0.25, y + 0.12, z);
    g.add(lamp);
    return lamp;
  });
  const list = (g.userData.beacons ?? []) as THREE.Object3D[][];
  list.push(halves);
  g.userData.beacons = list;
};

/** Toggles emergency beacons built with `lightBar`; `phase` should differ per vehicle. */
export const flashBeacons = (g: THREE.Object3D, time: number, phase: number): void => {
  const bars = g.userData.beacons as THREE.Object3D[][] | undefined;
  if (!bars) return;
  const on = Math.floor(time * 6 + phase) % 2 === 0;
  for (const [a, b] of bars) {
    a!.visible = on;
    b!.visible = !on;
  }
};

/** Cab with windscreen, side windows, grille and bumper; front face at `l / 2`. */
const cab = (g: THREE.Group, w: number, h: number, l: number, depth: number, color: number, base: number): void => {
  g.add(part(w, h, depth, color, 0, base + h / 2, l / 2 - depth / 2));
  g.add(pane(w * 0.86, h * 0.36, base + h * 0.7, l / 2, 1));
  sideWindows(g, w, depth * 0.55, h * 0.32, base + h * 0.7, l / 2 - depth * 0.35);
  g.add(part(w * 0.6, h * 0.18, 0.06, DARK, 0, base + h * 0.25, l / 2 + 0.03));
  g.add(part(w, 0.22, 0.2, DARK, 0, base - 0.05, l / 2 + 0.05));
};

/**
 * Stylised traffic vehicle facing +Z, origin at ground centre. At `night` the lamps shine, headlight beams and a red
 * tail glow are drawn on the road and buses and trams show lit windows.
 */
export const buildVehicle = (kind: VehicleKind, variant: number, night = false): THREE.Group => {
  const def = VEHICLES[kind];
  const { width: w, length: l, height: h } = def;
  const g = new THREE.Group();
  const color = PALETTE[variant % PALETTE.length]!;
  const cabin = night ? LIT_WINDOWS : GLASS;
  switch (kind) {
    case 'car':
    case 'taxi':
    case 'police': {
      const c = kind === 'taxi' ? 0xffd166 : kind === 'police' ? 0xffffff : color;
      const bodyH = h * 0.45;
      const bodyY = 0.35 + h * 0.22;
      const roofTop = 0.35 + h * 0.79 + 0.04;
      g.add(part(w, bodyH, l, c, 0, bodyY, 0));
      // Glasshouse with a body-coloured roof, plus grille and bumpers.
      g.add(part(w * 0.86, h * 0.34, l * 0.5, GLASS, 0, 0.35 + h * 0.6, -l * 0.05));
      g.add(part(w * 0.88, 0.08, l * 0.46, c, 0, 0.35 + h * 0.79, -l * 0.05));
      g.add(part(w * 0.5, 0.14, 0.05, DARK, 0, bodyY, l / 2 + 0.03));
      for (const side of [1, -1] as const) g.add(part(w, 0.14, 0.12, DARK, 0, 0.42, side * (l / 2 - 0.02)));
      if (kind === 'taxi') {
        g.add(part(0.6, 0.18, 0.3, 0xffffff, 0, roofTop + 0.09, -l * 0.05));
        g.add(part(0.2, 0.08, 0.08, 0x06d6a0, 0, roofTop + 0.22, -l * 0.05));
        stripe(g, w, l * 0.9, 0.08, 0x222222, bodyY + bodyH * 0.1, 0);
      }
      if (kind === 'police') {
        stripe(g, w, l * 0.96, bodyH * 0.35, 0x1d4ed8, bodyY, 0);
        g.add(part(w * 0.99, 0.04, l * 0.3, 0x1d4ed8, 0, bodyY + bodyH / 2 + 0.02, l * 0.34));
        lightBar(g, w * 0.7, roofTop + 0.05, -l * 0.05, BEACON.blue, BEACON.red);
      }
      wheels(g, w, l, 0.35);
      break;
    }
    case 'van':
      g.add(part(w, h * 0.8, l, color, 0, 0.35 + h * 0.4, 0));
      g.add(pane(w * 0.9, h * 0.3, 0.35 + h * 0.6, l / 2, 1));
      sideWindows(g, w, 1.1, h * 0.26, 0.35 + h * 0.6, l / 2 - 0.8);
      // Split rear doors with small windows.
      for (const x of [-w * 0.23, w * 0.23])
        g.add(part(w * 0.36, h * 0.2, 0.06, GLASS, x, 0.35 + h * 0.62, -l / 2 - 0.03));
      g.add(part(0.04, h * 0.7, 0.07, DARK, 0, 0.35 + h * 0.4, -l / 2 - 0.03));
      g.add(part(w * 0.5, 0.16, 0.05, DARK, 0, 0.35 + h * 0.2, l / 2 + 0.03));
      wheels(g, w, l, 0.38);
      break;
    case 'bus': {
      const base = 0.4;
      g.add(part(w, h * 0.85, l, 0xff9f1c, 0, base + h * 0.42, 0));
      g.add(part(w + 0.02, h * 0.28, l * 0.92, cabin, 0, base + h * 0.58, 0));
      // Big front windscreen with destination sign, and a rear window.
      g.add(pane(w * 0.9, h * 0.42, base + h * 0.5, l / 2, 1, cabin));
      g.add(part(w * 0.7, h * 0.08, 0.07, 0xffd166, 0, base + h * 0.77, l / 2 + 0.04));
      g.add(pane(w * 0.8, h * 0.24, base + h * 0.6, -l / 2, -1, cabin));
      // Doors on the kerb (right, -X) side, a roof A/C unit and bumpers.
      for (const z of [l / 2 - 1, -0.6]) g.add(part(0.06, h * 0.62, 1.1, cabin, -w / 2 - 0.03, base + h * 0.33, z));
      g.add(part(w * 0.6, 0.3, l * 0.25, 0xe9ecef, 0, base + h * 0.85 + 0.15, -l * 0.1));
      for (const side of [1, -1] as const) g.add(part(w, 0.2, 0.15, DARK, 0, base + 0.05, side * (l / 2 - 0.02)));
      wheels(g, w, l, 0.5);
      break;
    }
    case 'truck':
      cab(g, w, h * 0.7, l, 2.2, color, 0.45);
      g.add(part(w, h * 0.9, l - 2.5, 0xe9ecef, 0, 0.45 + h * 0.45, -1.2));
      g.add(part(0.04, h * 0.8, 0.07, DARK, 0, 0.45 + h * 0.45, -l / 2 - 0.03));
      g.add(part(0.4, 0.4, 1.2, CHROME, -w / 2 + 0.1, 0.8, l / 2 - 3));
      wheels(g, w, l, 0.5);
      break;
    case 'ambulance': {
      const base = 0.4;
      cab(g, w, h * 0.55, l, 1.6, 0xffffff, base);
      g.add(part(w, h * 0.85, l - 1.6, 0xffffff, 0, base + h * 0.42, -0.8));
      stripe(g, w, l * 0.98, h * 0.1, 0xe63946, base + h * 0.25, 0);
      // Red cross on each flank and on the back.
      for (const x of [-w / 2 - 0.04, w / 2 + 0.04]) {
        g.add(part(0.05, 0.7, 0.2, 0xe63946, x, base + h * 0.6, -l * 0.15));
        g.add(part(0.05, 0.2, 0.7, 0xe63946, x, base + h * 0.6, -l * 0.15));
      }
      g.add(part(0.2, 0.6, 0.06, 0xe63946, 0, base + h * 0.6, -l / 2 - 0.03));
      g.add(part(0.6, 0.2, 0.06, 0xe63946, 0, base + h * 0.6, -l / 2 - 0.03));
      lightBar(g, w * 0.8, base + h * 0.85 + 0.05, l / 2 - 1.75, BEACON.blue);
      wheels(g, w, l, 0.4);
      break;
    }
    case 'fireTruck': {
      const base = 0.5;
      const red = 0xd62828;
      cab(g, w, h * 0.72, l, 2.6, red, base);
      g.add(part(w, h * 0.72, l - 2.6, red, 0, base + h * 0.36, -1.3));
      // Silver equipment shutters and a white band.
      for (const z of [-l * 0.05, -l * 0.3]) {
        for (const x of [-w / 2 - 0.03, w / 2 + 0.03])
          g.add(part(0.05, h * 0.45, l * 0.2, CHROME, x, base + h * 0.36, z));
      }
      stripe(g, w, l * 0.98, 0.1, 0xffffff, base + h * 0.08, 0);
      // Roof ladder: two rails and rungs.
      const ladderY = base + h * 0.72 + 0.2;
      for (const x of [-0.45, 0.45]) g.add(part(0.08, 0.1, l - 2.2, CHROME, x, ladderY, -1));
      for (let z = -l / 2 + 1; z <= l / 2 - 3; z += 0.7) g.add(part(0.9, 0.06, 0.06, CHROME, 0, ladderY, z));
      lightBar(g, w * 0.8, base + h * 0.72 + 0.05, l / 2 - 0.4, BEACON.blue, BEACON.red);
      wheels(g, w, l, 0.55, [l * 0.3, -l * 0.26, -l * 0.38]);
      break;
    }
    case 'garbageTruck': {
      const base = 0.45;
      const green = 0x2a9d8f;
      cab(g, w, h * 0.68, l, 2, 0xffffff, base);
      g.add(part(w, h * 0.82, l - 3.4, green, 0, base + h * 0.41, -0.3));
      // Rear compactor, slightly taller and darker, with a loading step.
      g.add(part(w, h * 0.88, 1.4, 0x1d6f66, 0, base + h * 0.44, -l / 2 + 0.7));
      g.add(part(w * 0.8, h * 0.3, 0.06, DARK, 0, base + h * 0.3, -l / 2 - 0.03));
      g.add(part(w, 0.08, 0.35, CHROME, 0, base + 0.05, -l / 2 - 0.1));
      stripe(g, w, l - 3.4, 0.12, 0xffd166, base + h * 0.2, -0.3);
      lightBar(g, w * 0.5, base + h * 0.68 + 0.05, l / 2 - 0.5, BEACON.amber);
      wheels(g, w, l, 0.5);
      break;
    }
    case 'tanker': {
      const base = 0.45;
      cab(g, w, h * 0.72, l, 2.2, color, base);
      g.add(part(w * 0.9, 0.3, l - 2.3, DARK, 0, base + 0.2, -1.15));
      // Cylindrical tank with a coloured band, top walkway and hazard plate.
      const r = h * 0.36;
      const tankLen = l - 2.6;
      const geo = new THREE.CylinderGeometry(r, r, tankLen, 16);
      geo.rotateX(Math.PI / 2);
      const tank = new THREE.Mesh(geo, toon(CHROME));
      tank.position.set(0, base + 0.35 + r, -1.3);
      tank.castShadow = true;
      g.add(withOutline(tank, 0.08));
      g.add(part(0.06, r * 0.5, tankLen * 0.98, 0xe63946, -r - 0.01, base + 0.35 + r, -1.3));
      g.add(part(0.06, r * 0.5, tankLen * 0.98, 0xe63946, r + 0.01, base + 0.35 + r, -1.3));
      g.add(part(0.6, 0.06, tankLen * 0.8, DARK, 0, base + 0.35 + r * 2 + 0.03, -1.3));
      g.add(part(0.5, 0.35, 0.05, 0xff8c00, 0, base + 0.35 + r, -l / 2 - 0.03));
      wheels(g, w, l, 0.5, [l * 0.34, -l * 0.26, -l * 0.38]);
      break;
    }
    case 'motocarro': {
      // Three-wheeled Italian delivery van: tiny cab up front, open bed behind.
      g.add(part(w, h * 0.62, 1.2, color, 0, 0.3 + h * 0.31, l / 2 - 0.6));
      g.add(part(w * 0.9, h * 0.25, 0.08, GLASS, 0, 0.3 + h * 0.5, l / 2));
      g.add(part(w, 0.45, l - 1.2, 0x8d99ae, 0, 0.55, -0.6));
      const geo = new THREE.CylinderGeometry(0.28, 0.28, 0.2, 10);
      geo.rotateZ(Math.PI / 2);
      const mat = toon(0x1b1b1b);
      for (const [x, z] of [
        [0, l / 2 - 0.4],
        [-w / 2 + 0.1, -l * 0.3],
        [w / 2 - 0.1, -l * 0.3],
      ] as const) {
        const wheel = new THREE.Mesh(geo, mat);
        wheel.position.set(x, 0.28, z);
        g.add(wheel);
      }
      break;
    }
    case 'tram': {
      // Two-tone articulated tram with a pantograph.
      g.add(part(w, h * 0.35, l, 0xf4a261, 0, 0.3 + h * 0.18, 0));
      g.add(part(w + 0.02, h * 0.3, l * 0.96, cabin, 0, 0.3 + h * 0.5, 0));
      g.add(part(w, h * 0.15, l, 0xfff1d0, 0, 0.3 + h * 0.72, 0));
      g.add(part(1.4, 0.12, 0.12, 0x333333, 0, h + 0.6, 0));
      g.add(part(0.08, 0.7, 0.08, 0x333333, 0, h + 0.3, 0));
      for (const z of [-l / 2 + 2.5, 0, l / 2 - 2.5]) g.add(part(w * 0.9, 0.4, 2, 0x333333, 0, 0.2, z));
      break;
    }
  }
  // Tail/head lights.
  const lightGeo = new THREE.BoxGeometry(0.3, 0.15, 0.05);
  for (const x of [-w / 2 + 0.3, w / 2 - 0.3]) {
    const head = new THREE.Mesh(lightGeo, toon(0xfff3b0, { emissive: night ? 0xfff3b0 : 0x665f30 }));
    head.position.set(x, 0.75, l / 2 + 0.02);
    const tail = new THREE.Mesh(lightGeo, toon(0xff2233, { emissive: night ? 0xff2233 : 0x550000 }));
    tail.position.set(x, 0.75, -l / 2 - 0.02);
    g.add(head, tail);
  }
  if (night) {
    const beam = new THREE.Mesh(beamGeometry(w * 0.8, w * 2.2, 11, 0.55), glowMaterial(HEADLIGHT));
    beam.position.set(0, 0.06, l / 2);
    const tail = new THREE.Mesh(poolGeometry(w * 0.6, 0.45), glowMaterial(TAIL_LIGHT));
    tail.scale.z = 0.6;
    tail.position.set(0, 0.06, -l / 2 - 0.4);
    for (const m of [beam, tail]) {
      m.name = 'nightGlow';
      m.renderOrder = 1;
      g.add(m);
    }
  }
  return g;
};

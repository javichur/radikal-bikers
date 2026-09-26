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

const wheels = (g: THREE.Group, width: number, length: number, r: number): void => {
  const geo = new THREE.CylinderGeometry(r, r, 0.3, 12);
  geo.rotateZ(Math.PI / 2);
  const mat = toon(0x1b1b1b);
  for (const z of [-length * 0.34, length * 0.34]) {
    for (const x of [-width / 2 + 0.1, width / 2 - 0.1]) {
      const w = new THREE.Mesh(geo, mat);
      w.position.set(x, r, z);
      g.add(w);
    }
  }
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
    case 'taxi': {
      const c = kind === 'taxi' ? 0xffd166 : color;
      g.add(part(w, h * 0.45, l, c, 0, 0.35 + h * 0.22, 0));
      g.add(part(w * 0.86, h * 0.38, l * 0.5, GLASS, 0, 0.35 + h * 0.62, -l * 0.05));
      if (kind === 'taxi') g.add(part(0.6, 0.18, 0.3, 0x222222, 0, h + 0.2, -l * 0.05));
      wheels(g, w, l, 0.35);
      break;
    }
    case 'van':
      g.add(part(w, h * 0.8, l, color, 0, 0.35 + h * 0.4, 0));
      g.add(part(w * 0.9, h * 0.3, 0.1, GLASS, 0, 0.35 + h * 0.6, l / 2));
      wheels(g, w, l, 0.38);
      break;
    case 'bus':
      g.add(part(w, h * 0.85, l, 0xff9f1c, 0, 0.4 + h * 0.42, 0));
      g.add(part(w + 0.02, h * 0.28, l * 0.92, cabin, 0, 0.4 + h * 0.58, 0));
      wheels(g, w, l, 0.5);
      break;
    case 'truck':
      g.add(part(w, h * 0.7, 2.2, color, 0, 0.45 + h * 0.35, l / 2 - 1.1));
      g.add(part(w * 0.9, h * 0.25, 0.1, GLASS, 0, 0.45 + h * 0.5, l / 2));
      g.add(part(w, h * 0.9, l - 2.5, 0xe9ecef, 0, 0.45 + h * 0.45, -1.2));
      wheels(g, w, l, 0.5);
      break;
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

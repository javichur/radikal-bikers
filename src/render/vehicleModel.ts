import * as THREE from 'three';
import type { VehicleKind } from '../content/vehicles';
import { VEHICLES } from '../content/vehicles';
import { toon, withOutline } from './materials';

const PALETTE = [0xef476f, 0x118ab2, 0x06d6a0, 0xf78c6b, 0x8338ec, 0xffffff, 0x3a86ff, 0x8d99ae];
const GLASS = 0x2d3a5a;

const part = (w: number, h: number, d: number, color: number, x: number, y: number, z: number): THREE.Group => {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), toon(color));
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

/** Stylised traffic vehicle facing +Z, origin at ground centre. */
export const buildVehicle = (kind: VehicleKind, variant: number): THREE.Group => {
  const def = VEHICLES[kind];
  const { width: w, length: l, height: h } = def;
  const g = new THREE.Group();
  const color = PALETTE[variant % PALETTE.length]!;
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
      g.add(part(w + 0.02, h * 0.28, l * 0.92, GLASS, 0, 0.4 + h * 0.58, 0));
      wheels(g, w, l, 0.5);
      break;
    case 'truck':
      g.add(part(w, h * 0.7, 2.2, color, 0, 0.45 + h * 0.35, l / 2 - 1.1));
      g.add(part(w * 0.9, h * 0.25, 0.1, GLASS, 0, 0.45 + h * 0.5, l / 2));
      g.add(part(w, h * 0.9, l - 2.5, 0xe9ecef, 0, 0.45 + h * 0.45, -1.2));
      wheels(g, w, l, 0.5);
      break;
  }
  // Tail/head lights.
  const lightGeo = new THREE.BoxGeometry(0.3, 0.15, 0.05);
  for (const x of [-w / 2 + 0.3, w / 2 - 0.3]) {
    const head = new THREE.Mesh(lightGeo, toon(0xfff3b0, { emissive: 0x665f30 }));
    head.position.set(x, 0.75, l / 2 + 0.02);
    const tail = new THREE.Mesh(lightGeo, toon(0xff2233, { emissive: 0x550000 }));
    tail.position.set(x, 0.75, -l / 2 - 0.02);
    g.add(head, tail);
  }
  return g;
};

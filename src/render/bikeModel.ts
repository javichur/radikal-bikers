import * as THREE from 'three';
import type { CharacterDef } from '../content/characters';
import { canvasTexture, toon, withOutline } from './materials';

export interface BikeRig {
  readonly root: THREE.Group;
  /** Rotates around the rear axle for wheelies. */
  readonly pitch: THREE.Group;
  /** Leans into corners. */
  readonly lean: THREE.Group;
  readonly frontWheel: THREE.Object3D;
  readonly rearWheel: THREE.Object3D;
  readonly rider: THREE.Group;
}

const WHEEL_R = 0.28;
const REAR_Z = -0.55;

const pizzaTexture = (): THREE.Texture =>
  canvasTexture(128, 128, (c) => {
    c.fillStyle = '#fff4e0';
    c.fillRect(0, 0, 128, 128);
    c.fillStyle = '#e63946';
    c.beginPath();
    c.arc(64, 64, 40, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = '#fff';
    c.font = 'bold 34px sans-serif';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText('RR', 64, 66);
  });

const mesh = (geo: THREE.BufferGeometry, color: number, map?: THREE.Texture): THREE.Mesh => {
  const m = new THREE.Mesh(geo, toon(color, map ? { map } : {}));
  m.castShadow = true;
  return m;
};

const place = <T extends THREE.Object3D>(o: T, x: number, y: number, z: number): T => {
  o.position.set(x, y, z);
  return o;
};

const wheel = (): THREE.Group => {
  const g = new THREE.Group();
  const tyre = mesh(new THREE.TorusGeometry(WHEEL_R * 0.72, WHEEL_R * 0.3, 8, 16), 0x222222);
  tyre.rotation.y = Math.PI / 2;
  const hub = mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.16, 10), 0xcccccc);
  hub.rotation.z = Math.PI / 2;
  g.add(tyre, hub);
  return g;
};

/** Stylised delivery scooter + rider built from primitives (no external assets). */
export const buildBike = (c: CharacterDef): BikeRig => {
  const root = new THREE.Group();
  const lean = new THREE.Group();
  const pitch = new THREE.Group();
  pitch.position.set(0, WHEEL_R, REAR_Z);
  root.add(lean);
  lean.add(pitch);
  // Everything below is positioned relative to the rear axle.
  const body = new THREE.Group();
  body.position.set(0, -WHEEL_R, -REAR_Z);
  pitch.add(body);

  const { body: bodyColor, jacket, helmet } = c.colors;

  const rearWheel = place(wheel(), 0, WHEEL_R, REAR_Z);
  const frontWheel = place(wheel(), 0, WHEEL_R, 0.6);
  body.add(rearWheel, frontWheel);

  const hull = place(mesh(new THREE.CapsuleGeometry(0.28, 0.7, 4, 10), bodyColor), 0, 0.52, -0.3);
  hull.rotation.x = Math.PI / 2;
  body.add(withOutline(hull));
  body.add(withOutline(place(mesh(new THREE.BoxGeometry(0.42, 0.08, 0.9), 0x333344), 0, 0.42, 0.1)));
  const shield = place(mesh(new THREE.BoxGeometry(0.46, 0.75, 0.14), bodyColor), 0, 0.72, 0.52);
  shield.rotation.x = -0.25;
  body.add(withOutline(shield));
  const bar = place(mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.7, 8), 0x222222), 0, 1.12, 0.45);
  bar.rotation.z = Math.PI / 2;
  body.add(bar);
  body.add(place(mesh(new THREE.SphereGeometry(0.09, 10, 8), 0xfff6a0), 0, 1.0, 0.62));
  body.add(withOutline(place(mesh(new THREE.BoxGeometry(0.38, 0.2, 0.55), 0x3b2e2a), 0, 0.78, -0.35)));

  // Pizza box on the rear rack.
  const pizza = place(mesh(new THREE.BoxGeometry(0.6, 0.18, 0.6), 0xf2e3c6, pizzaTexture()), 0, 1.02, -0.62);
  body.add(withOutline(pizza));

  // Rider.
  const rider = new THREE.Group();
  body.add(rider);
  const torso = place(mesh(new THREE.CapsuleGeometry(0.2, 0.42, 4, 10), jacket), 0, 1.22, -0.12);
  torso.rotation.x = 0.35;
  rider.add(withOutline(torso));
  const head = place(mesh(new THREE.SphereGeometry(0.2, 14, 12), helmet), 0, 1.72, 0.02);
  rider.add(withOutline(head));
  rider.add(place(mesh(new THREE.BoxGeometry(0.3, 0.1, 0.1), 0x111122), 0, 1.72, 0.19));
  for (const side of [-1, 1]) {
    const arm = place(mesh(new THREE.CapsuleGeometry(0.07, 0.42, 4, 8), jacket), side * 0.24, 1.3, 0.2);
    arm.rotation.x = 1.0;
    rider.add(arm);
    const leg = place(mesh(new THREE.CapsuleGeometry(0.09, 0.4, 4, 8), 0x2b2d42), side * 0.17, 0.78, 0.05);
    leg.rotation.x = 1.3;
    rider.add(leg);
  }

  return { root, pitch, lean, frontWheel, rearWheel, rider };
};

export const BIKE_WHEEL_RADIUS = WHEEL_R;

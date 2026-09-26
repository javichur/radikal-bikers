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
  /** Handlebar + fork assembly, rotated around the (raked) steering axis. */
  readonly steer: THREE.Group;
  /** Turns the handlebar (radians, positive = left) and re-solves the rider's arms so the hands stay on the grips. */
  setSteer(angle: number): void;
}

const WHEEL_R = 0.28;
const REAR_Z = -0.55;
const FRONT_Z = 0.6;
/** Top of the head tube; the steering axis runs from here to the front axle. */
const HEAD = new THREE.Vector3(0, 1.02, 0.47);
const RAKE = Math.atan2(FRONT_Z - HEAD.z, HEAD.y - WHEEL_R);
const FORK_LEN = Math.hypot(FRONT_Z - HEAD.z, HEAD.y - WHEEL_R);
const UPPER_ARM = 0.34;
const FOREARM = 0.33;
const SKIN = 0xf1c27d;
const DARK = 0x1f1f28;
const CHROME = 0xd8dde3;
const TROUSERS = 0x2b2d42;

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

const plateTexture = (): THREE.Texture =>
  canvasTexture(128, 64, (c) => {
    c.fillStyle = '#f8f9fa';
    c.fillRect(0, 0, 128, 64);
    c.strokeStyle = '#111';
    c.lineWidth = 6;
    c.strokeRect(3, 3, 122, 58);
    c.fillStyle = '#111';
    c.font = 'bold 30px monospace';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText('RR-99', 64, 34);
  });

const mesh = (
  geo: THREE.BufferGeometry,
  color: number,
  opts: { map?: THREE.Texture; emissive?: number } = {},
): THREE.Mesh => {
  const m = new THREE.Mesh(geo, toon(color, opts));
  m.castShadow = true;
  return m;
};

const place = <T extends THREE.Object3D>(o: T, x: number, y: number, z: number): T => {
  o.position.set(x, y, z);
  return o;
};

const outlineMat = new THREE.MeshBasicMaterial({ color: 0x151522, side: THREE.BackSide });
const UP = new THREE.Vector3(0, 1, 0);

/** A tapered cylinder that can be stretched between two points at runtime (limbs, tubes). */
class Segment {
  readonly group = new THREE.Group();
  constructor(r0: number, r1: number, color: number, outline = true, radial = 10) {
    const geo = new THREE.CylinderGeometry(r1, r0, 1, radial, 1);
    geo.translate(0, 0.5, 0);
    const m = mesh(geo, color);
    this.group.add(m);
    if (outline) {
      const o = new THREE.Mesh(geo, outlineMat);
      o.scale.set(1 + 0.05 / r0, 1, 1 + 0.05 / r0);
      this.group.add(o);
    }
  }
  set(a: THREE.Vector3, b: THREE.Vector3): this {
    const dir = new THREE.Vector3().subVectors(b, a);
    const len = dir.length();
    this.group.position.copy(a);
    this.group.quaternion.setFromUnitVectors(UP, dir.divideScalar(Math.max(len, 1e-6)));
    this.group.scale.set(1, len, 1);
    return this;
  }
}

/** Sphere joint used to hide the seams between limb segments. */
const joint = (r: number, color: number): THREE.Mesh => mesh(new THREE.SphereGeometry(r, 10, 8), color);

/** Two-bone IK: elbow/knee position for a limb from `a` to `b`, bending towards `pole`. */
export const solveTwoBone = (
  a: THREE.Vector3,
  b: THREE.Vector3,
  l1: number,
  l2: number,
  pole: THREE.Vector3,
): THREE.Vector3 => {
  const ab = new THREE.Vector3().subVectors(b, a);
  const d = Math.min(Math.max(ab.length(), Math.abs(l1 - l2) + 1e-4), l1 + l2 - 1e-4);
  const u = ab.normalize();
  const cosA = (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d);
  const sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));
  const v = pole.clone().addScaledVector(u, -pole.dot(u));
  if (v.lengthSq() < 1e-8) v.set(0, -1, 0);
  v.normalize();
  return a
    .clone()
    .addScaledVector(u, l1 * cosA)
    .addScaledVector(v, l1 * sinA);
};

const wheel = (front: boolean): THREE.Group => {
  const g = new THREE.Group();
  const tyre = mesh(new THREE.TorusGeometry(WHEEL_R * 0.74, WHEEL_R * 0.27, 10, 24), 0x1c1c1c);
  tyre.rotation.y = Math.PI / 2;
  g.add(withOutline(tyre, 0.04));
  // Tread blocks.
  const treadGeo = new THREE.BoxGeometry(0.15, 0.03, 0.05);
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    const t = mesh(treadGeo, 0x111111);
    t.position.set(0, Math.cos(a) * WHEEL_R * 0.99, Math.sin(a) * WHEEL_R * 0.99);
    t.rotation.x = -a;
    g.add(t);
  }
  const rim = mesh(new THREE.CylinderGeometry(WHEEL_R * 0.55, WHEEL_R * 0.55, 0.1, 18, 1, true), CHROME);
  rim.rotation.z = Math.PI / 2;
  g.add(rim);
  // Five-spoke alloy.
  const spokeGeo = new THREE.BoxGeometry(0.06, WHEEL_R * 0.5, 0.035);
  spokeGeo.translate(0, WHEEL_R * 0.25, 0);
  for (let i = 0; i < 5; i++) {
    const s = mesh(spokeGeo, 0xadb5bd);
    s.rotation.x = (i / 5) * Math.PI * 2;
    g.add(s);
  }
  const hub = mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.18, 12), 0x6c757d);
  hub.rotation.z = Math.PI / 2;
  g.add(hub);
  if (front) {
    const disc = mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.015, 20), 0x9aa0a6);
    disc.rotation.z = Math.PI / 2;
    disc.position.x = 0.07;
    g.add(disc);
  } else {
    const drum = mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.06, 14), 0x495057);
    drum.rotation.z = Math.PI / 2;
    drum.position.x = -0.07;
    g.add(drum);
  }
  return g;
};

/** Smooth scooter rear cowl, lathed around the z axis. */
const cowlGeometry = (): THREE.BufferGeometry => {
  const pts = [
    [0.0, -0.44],
    [0.14, -0.43],
    [0.22, -0.36],
    [0.26, -0.2],
    [0.26, 0.05],
    [0.23, 0.22],
    [0.14, 0.34],
    [0.0, 0.36],
  ].map(([r, z]) => new THREE.Vector2(r, z));
  const geo = new THREE.LatheGeometry(pts, 16);
  geo.rotateX(Math.PI / 2);
  geo.scale(0.95, 0.8, 1);
  return geo;
};

/** Curved leg shield: a slice of a cylinder shell. */
const shieldGeometry = (): THREE.BufferGeometry => {
  const geo = new THREE.CylinderGeometry(0.34, 0.26, 0.72, 16, 1, true, -Math.PI * 0.32, Math.PI * 0.64);
  return geo;
};

const handlebarAssembly = (bodyColor: number): { group: THREE.Group; grips: THREE.Object3D[] } => {
  const g = new THREE.Group();
  const grips: THREE.Object3D[] = [];
  // Headset cover with speedo and headlight.
  const cover = mesh(new THREE.BoxGeometry(0.3, 0.14, 0.22), bodyColor);
  cover.position.set(0, 0.06, 0.02);
  g.add(withOutline(cover, 0.04));
  const light = mesh(new THREE.CylinderGeometry(0.075, 0.085, 0.06, 16), 0xfff6c2, { emissive: 0x8a7d3a });
  light.rotation.x = Math.PI / 2;
  light.position.set(0, 0.06, 0.14);
  g.add(light);
  const bezel = mesh(new THREE.TorusGeometry(0.085, 0.015, 6, 16), CHROME);
  bezel.position.set(0, 0.06, 0.17);
  g.add(bezel);
  const speedo = mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.03, 14), 0xf8f9fa, { emissive: 0x333333 });
  speedo.rotation.x = -0.9;
  speedo.position.set(0, 0.14, -0.05);
  g.add(speedo);
  const needle = mesh(new THREE.BoxGeometry(0.006, 0.035, 0.004), 0xe63946);
  needle.position.set(0.01, 0.155, -0.035);
  needle.rotation.set(-0.9, 0, -0.6);
  g.add(needle);
  // Bar, grips, levers, mirrors.
  const bar = mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.56, 8), 0x343a40);
  bar.rotation.z = Math.PI / 2;
  bar.position.set(0, 0.1, -0.04);
  g.add(bar);
  for (const side of [-1, 1]) {
    const grip = mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.12, 10), DARK);
    grip.rotation.z = Math.PI / 2;
    grip.position.set(side * 0.33, 0.1, -0.04);
    g.add(grip);
    const end = mesh(new THREE.SphereGeometry(0.03, 8, 6), CHROME);
    end.position.set(side * 0.395, 0.1, -0.04);
    g.add(end);
    const lever = mesh(new THREE.BoxGeometry(0.14, 0.012, 0.02), 0xadb5bd);
    lever.position.set(side * 0.3, 0.09, 0.03);
    lever.rotation.y = side * 0.15;
    g.add(lever);
    const stalk = new Segment(0.008, 0.008, 0x343a40, false, 6).set(
      new THREE.Vector3(side * 0.22, 0.1, -0.04),
      new THREE.Vector3(side * 0.3, 0.34, -0.06),
    );
    g.add(stalk.group);
    const mirror = mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.02, 12), DARK);
    mirror.rotation.x = Math.PI / 2;
    mirror.position.set(side * 0.31, 0.36, -0.06);
    const glass = mesh(new THREE.CircleGeometry(0.045, 12), 0xbde0fe, { emissive: 0x335577 });
    glass.position.set(side * 0.31, 0.36, -0.071);
    glass.rotation.y = Math.PI;
    g.add(mirror, glass);
    const marker = new THREE.Object3D();
    marker.position.set(side * 0.33, 0.1, -0.04);
    g.add(marker);
    grips.push(marker);
  }
  return { group: g, grips };
};

/** Detailed delivery scooter + rider built from primitives (no external assets). */
export const buildBike = (c: CharacterDef): BikeRig => {
  const root = new THREE.Group();
  const lean = new THREE.Group();
  const pitch = new THREE.Group();
  pitch.position.set(0, WHEEL_R, REAR_Z);
  root.add(lean);
  lean.add(pitch);
  // Everything below is positioned relative to the ground under the bike.
  const body = new THREE.Group();
  body.position.set(0, -WHEEL_R, -REAR_Z);
  pitch.add(body);

  const { body: bodyColor, jacket, helmet } = c.colors;

  // --- Chassis ---
  const rearWheel = place(wheel(false), 0, WHEEL_R, REAR_Z);
  body.add(rearWheel);
  const cowl = place(mesh(cowlGeometry(), bodyColor), 0, 0.55, -0.34);
  body.add(withOutline(cowl, 0.05));
  // Side panel stripes.
  for (const side of [-1, 1]) {
    const stripe = mesh(new THREE.BoxGeometry(0.01, 0.05, 0.5), 0xf1faee);
    stripe.position.set(side * 0.25, 0.56, -0.34);
    body.add(stripe);
  }
  const floor = mesh(new THREE.BoxGeometry(0.4, 0.07, 0.62), 0x343a40);
  floor.position.set(0, 0.36, 0.12);
  body.add(withOutline(floor, 0.04));
  const tunnel = mesh(new THREE.BoxGeometry(0.16, 0.12, 0.5), bodyColor);
  tunnel.position.set(0, 0.44, 0.1);
  body.add(tunnel);
  // Floor mat ribs.
  for (let i = 0; i < 5; i++) {
    const rib = mesh(new THREE.BoxGeometry(0.36, 0.012, 0.025), 0x212529);
    rib.position.set(0, 0.4, -0.08 + i * 0.1);
    body.add(rib);
  }
  const shield = place(mesh(shieldGeometry(), bodyColor), 0, 0.72, 0.28);
  shield.rotation.x = -0.22;
  const shieldMat = shield.material as THREE.MeshToonMaterial;
  shield.material = toon(shieldMat.color.getHex(), { side: THREE.DoubleSide });
  body.add(withOutline(shield, 0.03));
  const nose = mesh(new THREE.SphereGeometry(0.16, 12, 10, 0, Math.PI * 2, 0, Math.PI / 2), bodyColor);
  nose.scale.set(1.3, 0.8, 1);
  nose.rotation.x = Math.PI / 2;
  nose.position.set(0, 0.95, 0.5);
  body.add(nose);
  const horn = mesh(new THREE.BoxGeometry(0.12, 0.05, 0.02), 0x495057);
  horn.position.set(0, 0.82, 0.56);
  horn.rotation.x = -0.22;
  body.add(horn);
  // Seat with piping.
  const seat = mesh(new THREE.CapsuleGeometry(0.16, 0.5, 4, 10), 0x2b2118);
  seat.rotation.x = Math.PI / 2;
  seat.scale.set(1.05, 1, 0.45);
  seat.position.set(0, 0.78, -0.3);
  body.add(withOutline(seat, 0.04));
  const piping = mesh(new THREE.TorusGeometry(0.17, 0.012, 4, 20), 0xadb5bd);
  piping.rotation.x = Math.PI / 2;
  piping.scale.set(1, 2.1, 1);
  piping.position.set(0, 0.76, -0.3);
  body.add(piping);
  // Engine, swing arm, shock, exhaust.
  const engine = mesh(new THREE.BoxGeometry(0.18, 0.2, 0.38), 0x6c757d);
  engine.position.set(0.1, 0.3, -0.42);
  body.add(withOutline(engine, 0.03));
  const shock = new Segment(0.025, 0.025, 0xe63946, false, 8).set(
    new THREE.Vector3(-0.14, WHEEL_R, REAR_Z),
    new THREE.Vector3(-0.14, 0.6, -0.4),
  );
  body.add(shock.group);
  const spring = mesh(new THREE.TorusGeometry(0.035, 0.008, 4, 10), 0xffd166);
  spring.rotation.x = Math.PI / 2;
  spring.position.set(-0.14, 0.46, -0.47);
  body.add(spring);
  const pipe = new Segment(0.035, 0.03, 0x495057, false, 8).set(
    new THREE.Vector3(-0.05, 0.22, -0.15),
    new THREE.Vector3(-0.17, 0.3, -0.55),
  );
  body.add(pipe.group);
  const muffler = mesh(new THREE.CylinderGeometry(0.065, 0.075, 0.36, 12), 0xadb5bd);
  muffler.rotation.x = Math.PI / 2 - 0.25;
  muffler.position.set(-0.19, 0.34, -0.7);
  body.add(withOutline(muffler, 0.03));
  const tip = mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.03, 10), 0x111111);
  tip.rotation.x = Math.PI / 2 - 0.25;
  tip.position.set(-0.19, 0.39, -0.88);
  body.add(tip);
  // Rear fender, tail light, plate, rack.
  const fender = mesh(
    new THREE.CylinderGeometry(0.34, 0.34, 0.2, 14, 1, true, Math.PI * 1.05, Math.PI * 0.55),
    bodyColor,
  );
  fender.material = toon(bodyColor, { side: THREE.DoubleSide });
  fender.rotation.z = Math.PI / 2;
  fender.position.set(0, WHEEL_R, REAR_Z);
  body.add(fender);
  const tail = mesh(new THREE.BoxGeometry(0.2, 0.07, 0.05), 0xff4d4d, { emissive: 0x991111 });
  tail.position.set(0, 0.66, -0.8);
  body.add(tail);
  for (const side of [-1, 1]) {
    const blinker = mesh(new THREE.SphereGeometry(0.03, 8, 6), 0xffa94d, { emissive: 0x663300 });
    blinker.position.set(side * 0.16, 0.64, -0.78);
    body.add(blinker);
  }
  const plate = mesh(new THREE.PlaneGeometry(0.22, 0.11), 0xffffff, { map: plateTexture() });
  plate.rotation.set(0.35, Math.PI, 0);
  plate.position.set(0, 0.52, -0.84);
  body.add(plate);
  const rack = mesh(new THREE.BoxGeometry(0.44, 0.03, 0.46), 0x343a40);
  rack.position.set(0, 0.92, -0.62);
  body.add(rack);
  for (const x of [-0.2, 0.2]) {
    const strut = new Segment(0.012, 0.012, 0x343a40, false, 6).set(
      new THREE.Vector3(x, 0.92, -0.42),
      new THREE.Vector3(x * 0.8, 0.7, -0.52),
    );
    body.add(strut.group);
  }
  const pizza = place(mesh(new THREE.BoxGeometry(0.6, 0.18, 0.6), 0xf2e3c6, { map: pizzaTexture() }), 0, 1.03, -0.62);
  body.add(withOutline(pizza));
  const strap = mesh(new THREE.BoxGeometry(0.62, 0.19, 0.05), 0xe63946);
  strap.position.set(0, 1.03, -0.62);
  body.add(strap);

  // --- Steering: raked axis through the head tube down to the front axle ---
  const headTube = new THREE.Group();
  headTube.position.copy(HEAD);
  headTube.rotation.x = -RAKE;
  body.add(headTube);
  const steer = new THREE.Group();
  headTube.add(steer);
  for (const side of [-1, 1]) {
    const tube = new Segment(0.028, 0.024, CHROME, true, 8).set(
      new THREE.Vector3(side * 0.09, -FORK_LEN, 0),
      new THREE.Vector3(side * 0.07, 0.02, 0),
    );
    steer.add(tube.group);
    const slider = mesh(new THREE.CylinderGeometry(0.036, 0.036, 0.22, 8), 0x343a40);
    slider.position.set(side * 0.09, -FORK_LEN + 0.11, 0);
    steer.add(slider);
  }
  const crown = mesh(new THREE.BoxGeometry(0.22, 0.05, 0.08), 0x343a40);
  steer.add(crown);
  const frontWheelPivot = new THREE.Group();
  frontWheelPivot.position.set(0, -FORK_LEN, 0);
  frontWheelPivot.rotation.x = RAKE;
  steer.add(frontWheelPivot);
  const frontWheel = wheel(true);
  frontWheelPivot.add(frontWheel);
  const frontFender = mesh(
    new THREE.CylinderGeometry(0.34, 0.34, 0.16, 14, 1, true, -Math.PI * 0.15, Math.PI * 0.62),
    bodyColor,
  );
  frontFender.material = toon(bodyColor, { side: THREE.DoubleSide });
  frontFender.rotation.z = Math.PI / 2;
  frontWheelPivot.add(withOutline(frontFender, 0.03));
  const bars = handlebarAssembly(bodyColor);
  steer.add(bars.group);

  // --- Rider ---
  const rider = new THREE.Group();
  body.add(rider);
  const pelvis = mesh(new THREE.SphereGeometry(0.17, 12, 10), TROUSERS);
  pelvis.scale.set(1.15, 0.8, 1);
  pelvis.position.set(0, 0.92, -0.3);
  rider.add(withOutline(pelvis, 0.04));
  // Torso: tapered jacket leaning forward, with belt, zip and collar.
  const hip = new THREE.Vector3(0, 0.96, -0.3);
  const chest = new THREE.Vector3(0, 1.42, -0.14);
  rider.add(new Segment(0.17, 0.22, jacket, true, 12).set(hip, chest).group);
  const ribcage = mesh(new THREE.SphereGeometry(0.22, 14, 10), jacket);
  ribcage.scale.set(1.1, 0.75, 0.85);
  ribcage.position.copy(chest).add(new THREE.Vector3(0, -0.04, 0));
  rider.add(withOutline(ribcage, 0.04));
  const belt = mesh(new THREE.TorusGeometry(0.17, 0.025, 6, 16), 0x3d2b1f);
  belt.rotation.x = Math.PI / 2 - 0.34;
  belt.position.set(0, 1.0, -0.29);
  rider.add(belt);
  const zip = new Segment(0.01, 0.01, 0xf1faee, false, 4).set(
    new THREE.Vector3(0, 1.02, -0.13),
    new THREE.Vector3(0, 1.42, 0.05),
  );
  rider.add(zip.group);
  const badge = mesh(new THREE.CircleGeometry(0.05, 12), 0xffd166);
  badge.position.set(0.12, 1.33, 0.03);
  badge.rotation.x = -0.35;
  rider.add(badge);
  const collar = mesh(new THREE.TorusGeometry(0.1, 0.035, 6, 14), jacket);
  collar.rotation.x = Math.PI / 2 - 0.3;
  collar.position.set(0, 1.58, -0.12);
  rider.add(collar);
  const neck = new Segment(0.06, 0.055, SKIN, false, 8).set(
    new THREE.Vector3(0, 1.55, -0.13),
    new THREE.Vector3(0, 1.7, -0.08),
  );
  rider.add(neck.group);
  // Helmet with visor, chin guard and stripe.
  const headPos = new THREE.Vector3(0, 1.8, -0.05);
  const shell = mesh(new THREE.SphereGeometry(0.2, 18, 14), helmet);
  shell.scale.set(1, 1.02, 1.1);
  shell.position.copy(headPos);
  rider.add(withOutline(shell, 0.05));
  const visor = mesh(
    new THREE.SphereGeometry(0.205, 16, 8, -Math.PI * 0.32, Math.PI * 0.64, Math.PI * 0.36, Math.PI * 0.22),
    0x1b263b,
    {
      emissive: 0x0b1a2a,
    },
  );
  visor.material = toon(0x1b263b, { emissive: 0x0b1a2a, side: THREE.DoubleSide });
  visor.scale.set(1.02, 1.02, 1.12);
  visor.position.copy(headPos);
  rider.add(visor);
  const chin = mesh(new THREE.TorusGeometry(0.13, 0.04, 6, 14, Math.PI), helmet);
  chin.rotation.set(Math.PI / 2 + 0.2, 0, 0);
  chin.position.set(0, 1.68, 0.03);
  rider.add(chin);
  const stripe = mesh(new THREE.TorusGeometry(0.205, 0.022, 4, 24, Math.PI), bodyColor);
  stripe.rotation.y = Math.PI / 2;
  stripe.scale.set(1, 1.02, 1.1);
  stripe.position.copy(headPos);
  rider.add(stripe);

  // Legs: thighs along the seat, shins down to the floorboard, boots on the deck.
  for (const side of [-1, 1]) {
    const h = new THREE.Vector3(side * 0.12, 0.9, -0.3);
    const ankle = new THREE.Vector3(side * 0.15, 0.48, 0.14);
    const knee = solveTwoBone(h, ankle, 0.45, 0.43, new THREE.Vector3(side * 0.3, 0.3, 1));
    rider.add(new Segment(0.1, 0.075, TROUSERS).set(h, knee).group);
    rider.add(new Segment(0.07, 0.055, TROUSERS).set(knee, ankle).group);
    rider.add(place(joint(0.08, TROUSERS), knee.x, knee.y, knee.z));
    const boot = mesh(new THREE.BoxGeometry(0.12, 0.1, 0.26), DARK);
    boot.position.set(ankle.x, 0.44, ankle.z + 0.06);
    rider.add(withOutline(boot, 0.03));
    const sole = mesh(new THREE.BoxGeometry(0.13, 0.025, 0.27), 0x6c4f3d);
    sole.position.set(ankle.x, 0.395, ankle.z + 0.06);
    rider.add(sole);
  }

  // Arms: shoulders + IK-driven upper arm / forearm / glove, re-solved when steering.
  interface Arm {
    shoulder: THREE.Vector3;
    side: number;
    upper: Segment;
    fore: Segment;
    elbow: THREE.Mesh;
    hand: THREE.Group;
    grip: THREE.Object3D;
  }
  const arms: Arm[] = [-1, 1].map((side, i) => {
    const shoulder = new THREE.Vector3(side * 0.24, 1.44, -0.12);
    const pad = mesh(new THREE.SphereGeometry(0.095, 10, 8), jacket);
    pad.position.copy(shoulder);
    rider.add(withOutline(pad, 0.03));
    const upper = new Segment(0.075, 0.062, jacket);
    const fore = new Segment(0.06, 0.048, jacket);
    const elbow = joint(0.066, jacket);
    const hand = new THREE.Group();
    const palm = mesh(new THREE.BoxGeometry(0.08, 0.07, 0.1), DARK);
    const fingers = mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.085, 8), DARK);
    fingers.rotation.z = Math.PI / 2;
    fingers.position.set(0, -0.015, 0.045);
    const cuff = mesh(new THREE.CylinderGeometry(0.055, 0.05, 0.06, 8), DARK);
    cuff.rotation.x = Math.PI / 2;
    cuff.position.z = -0.07;
    hand.add(palm, fingers, cuff);
    rider.add(upper.group, fore.group, elbow, hand);
    return { shoulder, side, upper, fore, elbow, hand, grip: bars.grips[i]! };
  });

  const tmp = new THREE.Vector3();
  const setSteer = (angle: number): void => {
    steer.rotation.y = angle;
    body.updateMatrixWorld(true);
    const toRider = new THREE.Matrix4().copy(rider.matrixWorld).invert();
    for (const arm of arms) {
      const target = tmp.setFromMatrixPosition(arm.grip.matrixWorld).applyMatrix4(toRider).clone();
      target.y += 0.035;
      target.z -= 0.02;
      const pole = new THREE.Vector3(arm.side * 0.9, -1, -0.4);
      const elbow = solveTwoBone(arm.shoulder, target, UPPER_ARM, FOREARM, pole);
      arm.upper.set(arm.shoulder, elbow);
      arm.fore.set(elbow, target);
      arm.elbow.position.copy(elbow);
      arm.hand.position.copy(target);
      arm.hand.lookAt(tmp.copy(target).sub(elbow).add(target).applyMatrix4(rider.matrixWorld));
    }
  };
  setSteer(0);

  return { root, pitch, lean, frontWheel, rearWheel, rider, steer, setSteer };
};

export const BIKE_WHEEL_RADIUS = WHEEL_R;

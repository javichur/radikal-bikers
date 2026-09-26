import * as THREE from 'three';
import type { MonumentKind } from '../content/monuments';
import { toon, withOutline } from './materials';

/*
 * Low-poly landmark models. Origin at the foot of the footprint centre; local +Z faces the road and local X runs
 * along it (for a city gate, local X runs across the road and +Z along it).
 */

const WHITE = 0xf4f4f0;
const CREAM = 0xf1e3c6;
const STONE = 0xd8c3a0;
const BRICK = 0xb5613c;
const TILE_BLUE = 0x2a6fb0;
const GLASS = 0x8ecae6;
const DARK = 0x3d2b1f;
const BRONZE = 0x5b6b4f;

const box = (w: number, h: number, d: number, color: number, x = 0, y = 0, z = 0, outline = true): THREE.Object3D => {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), toon(color));
  m.position.set(x, y + h / 2, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return outline ? withOutline(m, 0.12) : m;
};

const mesh = (geo: THREE.BufferGeometry, color: number, x = 0, y = 0, z = 0, emissive?: number): THREE.Mesh => {
  const m = new THREE.Mesh(geo, toon(color, emissive === undefined ? {} : { emissive }));
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
};

/** Thin rod between two local points (cables, ribs). */
const rod = (a: THREE.Vector3, b: THREE.Vector3, r: number, color: number): THREE.Mesh => {
  const dir = new THREE.Vector3().subVectors(b, a);
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, dir.length(), 5), toon(color));
  m.position.copy(a).addScaledVector(dir, 0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  return m;
};

/** Row of battlements along the top edge of a box of the given size. */
const battlements = (g: THREE.Group, w: number, d: number, y: number, x0 = 0, z0 = 0): void => {
  const geo = new THREE.BoxGeometry(1.2, 1.4, 1.2);
  const mat = toon(STONE);
  for (let x = -w / 2 + 0.6; x <= w / 2 - 0.6; x += 2.4) {
    for (const z of [-d / 2 + 0.6, d / 2 - 0.6]) {
      const b = new THREE.Mesh(geo, mat);
      b.position.set(x0 + x, y + 0.7, z0 + z);
      g.add(b);
    }
  }
  for (let z = -d / 2 + 3; z <= d / 2 - 3; z += 2.4) {
    for (const x of [-w / 2 + 0.6, w / 2 - 0.6]) {
      const b = new THREE.Mesh(geo, mat);
      b.position.set(x0 + x, y + 0.7, z0 + z);
      g.add(b);
    }
  }
};

/** Regular prism (`sides` faces) standing on y = 0, optionally rotated so a face points to +Z. */
const prism = (r: number, h: number, sides: number, color: number, x = 0, y = 0, z = 0): THREE.Mesh => {
  const m = mesh(new THREE.CylinderGeometry(r, r, h, sides), color, x, y + h / 2, z);
  m.rotation.y = Math.PI / sides;
  m.receiveShadow = true;
  return m;
};

/** Flat arched opening (round or pointed gothic arch) facing +Z, `w` wide and `h` tall to the crown. */
const arch = (w: number, h: number, color: number, pointed = false): THREE.Mesh => {
  const shape = new THREE.Shape();
  const spring = Math.max(0, h - w / 2);
  shape.moveTo(-w / 2, 0);
  shape.lineTo(-w / 2, spring);
  if (pointed) {
    shape.quadraticCurveTo(-w / 2, spring + w * 0.45, 0, spring + w * 0.75);
    shape.quadraticCurveTo(w / 2, spring + w * 0.45, w / 2, spring);
  } else {
    shape.absarc(0, spring, w / 2, Math.PI, 0, true);
  }
  shape.lineTo(w / 2, 0);
  shape.lineTo(-w / 2, 0);
  return new THREE.Mesh(new THREE.ShapeGeometry(shape, 6), toon(color, { side: THREE.DoubleSide }));
};

/** Places a flat detail (window, arch, relief) just in front of a wall facing `ry` (0 = +Z). */
const onWall = (g: THREE.Group, m: THREE.Object3D, x: number, y: number, z: number, ry = 0): void => {
  m.position.set(x, y, z);
  m.rotation.y = ry;
  g.add(m);
};

/** A row of arched openings along a façade facing +Z at depth `z`. */
const arcade = (
  g: THREE.Group,
  from: number,
  to: number,
  step: number,
  w: number,
  h: number,
  y: number,
  z: number,
  color = DARK,
  pointed = false,
): void => {
  for (let x = from; x <= to + 1e-6; x += step) onWall(g, arch(w, h, color, pointed), x, y, z);
};

/** Palm tree: curved trunk and a crown of drooping fronds. */
const palm = (g: THREE.Group, x: number, z: number, h = 9, y = 0): void => {
  g.add(mesh(new THREE.CylinderGeometry(0.22, 0.35, h, 6), 0x8d6e4a, x, y + h / 2, z));
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    const leaf = mesh(
      new THREE.BoxGeometry(0.5, 0.08, 3.2),
      0x3a9d23,
      x + Math.sin(a) * 1.4,
      y + h - 0.3,
      z + Math.cos(a) * 1.4,
    );
    leaf.rotation.set(0.45, a, 0, 'YXZ');
    g.add(leaf);
  }
};

/** Bronze-coloured figure: a small statue made of a body and a head. */
const figure = (g: THREE.Group, x: number, y: number, z: number, s = 1, color = BRONZE): void => {
  g.add(mesh(new THREE.CylinderGeometry(0.28 * s, 0.4 * s, 1.5 * s, 6), color, x, y + 0.75 * s, z));
  g.add(mesh(new THREE.SphereGeometry(0.3 * s, 8, 6), color, x, y + 1.75 * s, z));
};

/** Ring of coloured trencadís (broken-tile mosaic) dots around a horizontal band. */
const trencadis = (g: THREE.Group, w: number, y: number, z: number, colors: readonly number[]): void => {
  const geo = new THREE.BoxGeometry(0.9, 0.9, 0.12);
  colors.forEach((c, k) => {
    const mat = toon(c);
    for (let x = -w / 2 + 0.8 + k * 1.1; x <= w / 2 - 0.8; x += colors.length * 1.1) {
      const t = new THREE.Mesh(geo, mat);
      t.position.set(x, y, z);
      t.rotation.z = Math.PI / 4;
      g.add(t);
    }
  });
};

const models: Record<MonumentKind, (g: THREE.Group) => void> = {
  palauArts: (g) => {
    // Palau de les Arts: two white trencadís shells, cut away to show the glazed auditorium, wrapped around a
    // podium and crowned by the long steel "feather" cantilevered from the back, over its reflecting ponds.
    g.add(box(84, 0.3, 46, 0x4cc9f0, 0, 0, 0, false));
    g.add(box(60, 4, 26, 0xe9ecef, 0, 0, 0));
    g.add(mesh(new THREE.BoxGeometry(40, 16, 18), GLASS, 0, 12, 1, 0x0b2a3a));
    for (const k of [-1, 1]) {
      // Each shell is a tilted half-ellipsoid, open on the inner side.
      const shell = mesh(new THREE.SphereGeometry(1, 20, 12, 0, Math.PI), WHITE, 0, 18, k * 7);
      shell.material = toon(WHITE, { side: THREE.DoubleSide });
      shell.scale.set(36, 20, 10);
      shell.rotation.set(0, k > 0 ? 0 : Math.PI, k * 0.12);
      g.add(shell);
    }
    const feather = mesh(new THREE.BoxGeometry(76, 1.4, 5), 0xd9dde3, 8, 38, 0);
    feather.rotation.z = -0.14;
    g.add(feather);
    for (let i = 0; i < 9; i++) {
      const x = -26 + i * 8;
      g.add(
        rod(new THREE.Vector3(x, 38 + Math.tan(0.14) * (8 - x) - 0.8, 0), new THREE.Vector3(x, 30, 0), 0.25, 0xc0c4ca),
      );
    }
    for (const x of [-30, 30]) g.add(box(3, 5, 30, WHITE, x, 0, 0));
  },
  hemisferic: (g) => {
    // L'Hemisfèric, the "eye of knowledge": an elongated shell of concrete ribs over the IMAX iris, with the
    // folding glass eyelid, doubled by its reflection in the shallow pond.
    g.add(box(64, 0.3, 44, 0x4cc9f0, 0, 0, 0, false));
    const shell = mesh(new THREE.SphereGeometry(1, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), WHITE, 0, 0.3, 0);
    shell.scale.set(26, 12, 13);
    g.add(shell);
    const reflection = mesh(new THREE.SphereGeometry(1, 20, 6, 0, Math.PI * 2, 0, Math.PI / 2), 0x9fd8ea, 0, 0.31, 0);
    reflection.scale.set(26, -3, 13);
    g.add(reflection);
    const lid = mesh(new THREE.SphereGeometry(1, 16, 8, 0, Math.PI, 0, Math.PI / 2), GLASS, 0, 0.4, 5, 0x103040);
    lid.scale.set(22, 9, 10);
    lid.rotation.y = -Math.PI / 2;
    g.add(lid);
    for (let i = -5; i <= 5; i++) {
      const x = i * 3.8;
      const hgt = 9 * Math.sqrt(Math.max(0, 1 - (x / 22) ** 2));
      g.add(rod(new THREE.Vector3(x, 0.4, 13.5), new THREE.Vector3(x * 0.9, hgt + 0.3, 5), 0.18, WHITE));
    }
    g.add(mesh(new THREE.SphereGeometry(5, 14, 10), 0xf4a261, 0, 5, 6));
    g.add(box(4, 0.6, 22, 0xd8d8d0, 0, 0, 22, false));
  },
  museuCiencies: (g) => {
    // Museu de les Ciències: 220 m of white concrete "whale skeleton": tree-like pillars along the glazed north
    // front, a stepped roof of five ribbed bays and the closed south façade.
    g.add(box(88, 20, 20, WHITE, 0, 0, -6));
    for (let k = 0; k < 5; k++) g.add(box(16, 5 - (k % 2) * 2, 20, 0xeaeaea, -34 + k * 17, 20, -6));
    g.add(mesh(new THREE.BoxGeometry(84, 18, 1), GLASS, 0, 11, 5, 0x0b2a3a));
    for (let x = -42; x <= 42; x += 6) {
      // Tree pillar: a trunk that branches into two arms holding the roof.
      g.add(rod(new THREE.Vector3(x, 0, 11), new THREE.Vector3(x, 12, 9), 0.9, WHITE));
      g.add(rod(new THREE.Vector3(x, 12, 9), new THREE.Vector3(x - 2.6, 24, 4), 0.6, WHITE));
      g.add(rod(new THREE.Vector3(x, 12, 9), new THREE.Vector3(x + 2.6, 24, 4), 0.6, WHITE));
    }
    g.add(box(90, 1.2, 4, WHITE, 0, 24, 3));
  },
  umbracle: (g) => {
    // L'Umbracle: a landscaped walkway under 55 fixed white arches and the floating arches above them, planted with
    // palms, over the car park.
    g.add(box(60, 3, 18, 0xd8d8d0, 0, 0, 0));
    g.add(box(58, 0.4, 16, 0x8ab17d, 0, 3, 0, false));
    for (let x = -28; x <= 28; x += 3.2) {
      const a = mesh(new THREE.TorusGeometry(8, 0.35, 5, 14, Math.PI), WHITE, x, 3, 0);
      a.rotation.y = Math.PI / 2;
      a.scale.y = 1.9;
      g.add(a);
      g.add(rod(new THREE.Vector3(x, 18.4, -6), new THREE.Vector3(x + 1.6, 18.4, 6), 0.25, WHITE));
    }
    for (const x of [-22, -12, -2, 8, 18]) palm(g, x, 0, 9, 3.4);
    for (const x of [-17, -7, 3, 13, 23]) g.add(mesh(new THREE.SphereGeometry(1.2, 8, 6), 0x5a8f3c, x, 4.4, 3));
  },
  assutPylon: (g) => {
    // The Assut de l'Or: the curved white pylon of the cable-stayed bridge (the tallest point of València), leaning
    // back over the deck with its fan of stays.
    const pylon = mesh(new THREE.CylinderGeometry(0.8, 2.4, 64, 6), WHITE, 0, 0, 0);
    pylon.geometry.translate(0, 32, 0);
    pylon.rotation.z = -0.2;
    g.add(pylon);
    const top = new THREE.Vector3(Math.sin(0.2) * 64, Math.cos(0.2) * 64 - 2, 0);
    for (let i = 0; i < 12; i++) {
      const a = top.clone().multiplyScalar(0.45 + i * 0.045);
      g.add(rod(a, new THREE.Vector3(-14 - i * 8, 8, 7), 0.12, 0xdddddd));
    }
    g.add(rod(top, new THREE.Vector3(top.x + 18, 0, 0), 0.3, 0xdddddd));
  },
  palauMusica: (g) => {
    // Palau de la Música: the great glass barrel vault on its white portico, behind a pond with fountains and
    // palms in the gardens of the riverbed.
    g.add(box(52, 7, 24, CREAM, 0, 0, 0));
    const vault = mesh(new THREE.CylinderGeometry(11, 11, 50, 18, 1, false, 0, Math.PI), GLASS, 0, 7, 0, 0x0b2a3a);
    vault.rotation.z = Math.PI / 2;
    vault.rotation.x = Math.PI / 2;
    g.add(vault);
    for (let x = -24; x <= 24; x += 4) {
      const rib = mesh(new THREE.TorusGeometry(11.1, 0.18, 4, 18, Math.PI), WHITE, x, 7, 0);
      rib.rotation.y = Math.PI / 2;
      g.add(rib);
    }
    for (let x = -24; x <= 24; x += 4) g.add(box(0.8, 7, 0.8, WHITE, x, 0, 12.3, false));
    g.add(box(40, 0.4, 12, 0x4cc9f0, 0, 0, 20, false));
    for (let x = -16; x <= 16; x += 4) g.add(mesh(new THREE.ConeGeometry(0.4, 2.4, 6), 0xe0f7ff, x, 1.6, 20));
    for (const x of [-24, 24]) palm(g, x, 20);
  },
  peineta: (g) => {
    // Pont de l'Exposició: a slender white arch leaning over the deck, combed with ribs.
    g.add(box(44, 1.2, 8, WHITE, 0, 6, 0));
    for (const x of [-18, 18]) g.add(box(2, 6, 6, STONE, x, 0, 0, false));
    const a = mesh(new THREE.TorusGeometry(20, 0.8, 6, 24, Math.PI), WHITE, 0, 7, -3);
    a.rotation.x = -0.35;
    g.add(a);
    for (let i = 1; i < 16; i++) {
      const t = (i / 16) * Math.PI;
      const p = new THREE.Vector3(
        Math.cos(t) * 20,
        7 + Math.sin(t) * 20 * Math.cos(0.35),
        -3 - Math.sin(t) * 20 * 0.34,
      );
      g.add(rod(p, new THREE.Vector3(p.x, 7.2, 0), 0.22, WHITE));
    }
  },
  bellesArts: (g) => {
    // Museu de Belles Arts (the old Col·legi de Sant Pius V): baroque brick college with stone corners, round-arched
    // windows and the drum and blue-tiled dome of the chapel with its lantern.
    g.add(box(38, 14, 24, BRICK, 0, 0, 0));
    g.add(box(38.4, 1, 24.4, STONE, 0, 13.5, 0, false));
    for (const x of [-18.5, 18.5]) g.add(box(1.4, 14, 24.6, STONE, x, 0, 0, false));
    arcade(g, -15, 15, 5, 1.8, 3.2, 2, 12.05, DARK);
    arcade(g, -15, 15, 5, 1.6, 2.6, 8, 12.05, DARK);
    g.add(box(8, 10, 1, STONE, 0, 0, 12.4));
    g.add(prism(6.4, 5, 8, CREAM, 0, 14, 0));
    g.add(mesh(new THREE.SphereGeometry(6.6, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), TILE_BLUE, 0, 19, 0));
    g.add(prism(1.3, 2.4, 8, CREAM, 0, 25.4, 0));
    g.add(mesh(new THREE.ConeGeometry(1.5, 2.4, 8), TILE_BLUE, 0, 29, 0));
  },
  torresSerrans: (g) => {
    // Torres de Serrans (1392): two polygonal towers open on the city side, joined by the gate with its round arch,
    // the continuous machicolation over it and the gothic tracery gallery, all crowned with merlons.
    for (const x of [-19, 19]) {
      g.add(prism(8, 27, 10, STONE, x, 0, 3));
      g.add(box(16, 27, 6, STONE, x, 0, -4));
      g.add(prism(8.6, 1.4, 10, 0xcdb58e, x, 18, 3));
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2;
        const m = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.6, 1.2), toon(STONE));
        m.position.set(x + Math.sin(a) * 7.8, 27.8, 3 + Math.cos(a) * 7.8);
        m.rotation.y = a;
        g.add(m);
      }
      for (const y of [8, 14]) onWall(g, arch(0.6, 2.2, DARK), x - Math.sign(x) * 4, y, 11.1);
    }
    g.add(box(24, 10, 14, STONE, 0, 13, 0));
    g.add(box(24.6, 1.2, 15, 0xcdb58e, 0, 13, 0));
    battlements(g, 24, 14, 23, 0, 0);
    for (const z of [-7.1, 7.1]) {
      arcade(g, -9, 9, 3, 2.2, 5.2, 16, z, DARK, true);
      g.add(box(22, 0.5, 0.6, 0xcdb58e, 0, 21.4, z));
      onWall(g, arch(2.6, 3, 0x2a6fb0), 0, 9.6, z * 1.01);
    }
  },
  fontTuria: (g) => {
    // Plaça de la Mare de Déu: the Font del Túria, the bronze river god with the eight maidens of the irrigation
    // channels, and behind it the Basílica dels Desamparats with its blue-tiled dome.
    g.add(mesh(new THREE.CylinderGeometry(6.4, 6.8, 1, 20), STONE, 0, 0.5, 0));
    g.add(mesh(new THREE.CylinderGeometry(6, 6, 0.2, 20), 0x6fc3df, 0, 1.05, 0, 0x0b3d4f));
    g.add(mesh(new THREE.BoxGeometry(3.2, 1.2, 1.4), BRONZE, 0, 1.7, 0));
    figure(g, 0.9, 2.2, 0, 1.2);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      figure(g, Math.sin(a) * 5.2, 1, Math.cos(a) * 5.2, 0.6);
    }
    g.add(box(22, 13, 16, CREAM, 0, 0, -15));
    arcade(g, -8, 8, 4, 1.4, 3, 3, -6.9, DARK);
    g.add(prism(6.4, 4, 12, CREAM, 0, 13, -15));
    const dome = mesh(new THREE.SphereGeometry(6.6, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), TILE_BLUE, 0, 17, -15);
    dome.scale.z = 0.8;
    g.add(dome);
    g.add(mesh(new THREE.ConeGeometry(0.9, 3, 8), CREAM, 0, 24.5, -15));
  },
  micalet: (g) => {
    // El Micalet (51 m): the plain octagonal gothic bell tower, the belfry with a tall pointed window on each
    // face, the balustraded terrace and the small iron-framed bell turret on top.
    g.add(prism(5, 34, 8, STONE));
    for (const y of [12, 24]) g.add(prism(5.15, 0.4, 8, 0xc9b48f, 0, y));
    g.add(prism(5.3, 7, 8, 0xc9b48f, 0, 34));
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const w = arch(1.8, 5.4, DARK, true);
      w.position.set(Math.sin(a) * 5.1, 34.8, Math.cos(a) * 5.1);
      w.rotation.y = a;
      g.add(w);
    }
    g.add(prism(5.6, 1, 8, STONE, 0, 41));
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      g.add(box(0.5, 1.1, 0.5, STONE, Math.sin(a) * 5.3, 42, Math.cos(a) * 5.3, false));
    }
    g.add(prism(1.8, 3, 8, STONE, 0, 42));
    for (const x of [-1.4, 1.4]) g.add(box(0.2, 4, 0.2, 0x333333, x, 45, 0, false));
    g.add(box(3, 0.2, 0.2, 0x333333, 0, 49, 0, false));
    g.add(mesh(new THREE.SphereGeometry(0.7, 8, 6), BRONZE, 0, 47.4, 0));
  },
  catedral: (g) => {
    // Catedral de València: the gothic nave and transept, the octagonal cimbori with its tracery windows over the
    // crossing, the apse and the concave baroque Porta dels Ferros with its columns.
    g.add(box(46, 16, 16, STONE, 0, 0, 0));
    g.add(box(18, 18, 34, STONE, 4, 0, 0));
    const roof = mesh(new THREE.CylinderGeometry(8, 8, 46, 3), 0xb5613c, 0, 16, 0);
    roof.rotation.z = Math.PI / 2;
    roof.scale.set(1, 1, 0.35);
    g.add(roof);
    g.add(prism(6.5, 10, 8, 0xd6bf97, 4, 18, 0));
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const w = arch(2.4, 7.4, DARK, true);
      w.position.set(4 + Math.sin(a) * 6.3, 19.2, Math.cos(a) * 6.3);
      w.rotation.y = a;
      g.add(w);
    }
    g.add(prism(6.8, 1, 8, STONE, 4, 28));
    const apse = mesh(new THREE.CylinderGeometry(8, 8, 16, 12, 1, false, Math.PI, Math.PI), STONE, 23, 8, 0);
    g.add(apse);
    arcade(g, -18, -2, 4, 1.8, 6, 3, 8.05, DARK, true);
    // Porta dels Ferros: a concave baroque frontispiece at the west end, by the Plaça de la Reina.
    const front = mesh(
      new THREE.CylinderGeometry(9, 9, 22, 12, 1, true, -Math.PI / 3, (Math.PI * 2) / 3),
      0xe2cfa6,
      -30,
      11,
      0,
    );
    front.material = toon(0xe2cfa6, { side: THREE.DoubleSide });
    front.rotation.y = -Math.PI / 2;
    g.add(front);
    for (const z of [-5, -2, 2, 5]) g.add(prism(0.5, 14, 8, WHITE, -21.5 - Math.abs(z) * 0.4, 1, z));
  },
  generalitat: (g) => {
    // Palau de la Generalitat: gothic stone palace with a round-arched doorway, mullioned windows, and the square
    // Torre Nova at the corner of the Plaça de Manises, ringed with gargoyles under its cornice.
    g.add(box(18, 14, 14, 0xd9c49b, -1, 0, -1));
    g.add(box(18.4, 0.8, 14.4, STONE, -1, 14, -1));
    onWall(g, arch(3, 4.6, DARK), -3, 0.02, 6.05);
    for (const x of [-7, 1]) onWall(g, arch(2.2, 2.8, DARK, true), x, 8, 6.05);
    g.add(box(8, 22, 8, 0xd9c49b, 5, 0, 2));
    g.add(box(8.8, 1, 8.8, STONE, 5, 22, 2));
    for (const y of [9, 16]) onWall(g, arch(1.6, 3, DARK, true), 5, y, 6.05);
    for (const [dx, dz] of [
      [-4.6, 2],
      [4.6, 2],
      [0, 6.6],
      [0, -2.6],
    ] as const) {
      g.add(box(0.5, 0.5, 1.6, STONE, 5 + dx, 21, dz, false));
    }
    g.add(box(0.3, 1.2, 1.4, 0xe63946, -9, 11, 6.3, false));
  },
  mercatCentral: (g) => {
    // Mercat Central (1928): the modernist market hall of iron, glass and brick with ceramic and trencadís
    // decoration, its main dome crowned by the cotorra (parrot) weathervane and a second dome over the fish market.
    g.add(box(40, 10, 28, 0xe8c9a0, 0, 0, 0));
    g.add(box(40.4, 1, 28.4, BRICK, 0, 10, 0, false));
    arcade(g, -16, 16, 4, 2.6, 7, 0.02, 14.05, GLASS);
    trencadis(g, 40, 11.2, 14.3, [0x2a6fb0, 0xffd166, 0x3a9d23, 0xe76f51]);
    const roof = mesh(new THREE.CylinderGeometry(12, 12, 40, 4, 1), 0x9fbfcf, 0, 10, 0);
    roof.rotation.z = Math.PI / 2;
    roof.scale.set(0.5, 1, 1);
    roof.rotation.x = Math.PI / 4;
    g.add(roof);
    g.add(prism(5, 6, 16, 0xe8c9a0, -6, 14, 0));
    g.add(mesh(new THREE.SphereGeometry(5.3, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), 0x6a9fb5, -6, 20, 0));
    g.add(mesh(new THREE.ConeGeometry(0.4, 3, 6), 0x444444, -6, 26.6, 0));
    const parrot = mesh(new THREE.SphereGeometry(0.8, 8, 6), 0x2f9e44, -6, 28.6, 0);
    parrot.scale.set(1.8, 1, 0.8);
    g.add(parrot);
    g.add(prism(3.2, 3, 12, 0xe8c9a0, 12, 14, 0));
    g.add(mesh(new THREE.SphereGeometry(3.4, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), 0x6a9fb5, 12, 17, 0));
    g.add(mesh(new THREE.ConeGeometry(0.6, 1.6, 6), 0xff8c1a, 12, 21.2, 0));
  },
  llotja: (g) => {
    // Llotja de la Seda (1498, UNESCO World Heritage): the late-gothic silk exchange, its Sala de Contractació with
    // the ogee portal and tall pointed windows, the square tower and the Consolat del Mar, all topped by crown-shaped
    // merlons.
    g.add(box(15, 12, 13, STONE, -6.5, 0, 0));
    g.add(box(8, 16, 9, STONE, 3, 0, 0));
    g.add(box(10, 11, 13, STONE, 11, 0, 0));
    onWall(g, arch(3.4, 6, DARK, true), -6.5, 0.02, 6.55);
    for (const x of [-12, -1]) onWall(g, arch(1.8, 5, DARK, true), x, 4.5, 6.55);
    for (const x of [8, 14]) onWall(g, arch(1.6, 2.6, DARK, true), x, 6, 6.55);
    onWall(g, arch(1.4, 3, DARK, true), 3, 10, 4.55);
    const crown = (x0: number, w: number, y: number, d: number): void => {
      for (let x = x0 - w / 2 + 0.7; x <= x0 + w / 2 - 0.7; x += 1.4) {
        for (const z of [-d / 2 + 0.3, d / 2 - 0.3]) {
          g.add(box(0.8, 1.1, 0.5, STONE, x, y, z, false));
          g.add(mesh(new THREE.ConeGeometry(0.45, 0.6, 4), STONE, x, y + 1.4, z));
        }
      }
    };
    crown(-6.5, 15, 12, 13);
    crown(3, 8, 16, 9);
    crown(11, 10, 11, 13);
  },
  ajuntament: (g) => {
    // Casa Consistorial: the long cream façade with its balconies and statues, the domed corner pavilions and the
    // central clock tower topped with its dome and spire.
    g.add(box(50, 20, 20, CREAM, 0, 0, 0));
    for (const x of [-22, 22]) {
      g.add(box(8, 24, 20, CREAM, x, 0, 0));
      g.add(mesh(new THREE.SphereGeometry(3.4, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), 0x6c757d, x, 24, 0));
    }
    arcade(g, -17, 17, 3.4, 1.4, 3, 3, 10.05, DARK);
    arcade(g, -17, 17, 3.4, 1.4, 3.4, 10, 10.05, DARK);
    g.add(box(22, 0.4, 2, STONE, 0, 9, 11));
    g.add(box(12, 30, 10, CREAM, 0, 0, 4));
    arcade(g, -3, 3, 3, 2, 5, 1, 9.05, DARK);
    const clock = mesh(new THREE.CylinderGeometry(2.4, 2.4, 0.4, 16), 0xffffff, 0, 26, 9.3, 0x555555);
    clock.rotation.x = Math.PI / 2;
    g.add(clock);
    g.add(prism(4.6, 4, 8, CREAM, 0, 30, 4));
    g.add(mesh(new THREE.SphereGeometry(4.6, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), 0x6c757d, 0, 34, 4));
    g.add(mesh(new THREE.ConeGeometry(0.6, 5, 6), 0xffd166, 0, 40.5, 4));
    for (const x of [-10, 10]) figure(g, x, 20, 9, 1.2, WHITE);
  },
  correos: (g) => {
    // Edifici de Correus: stone façade with the giant columns, the sculpted crown over the corner and the stained
    // glass dome.
    g.add(box(28, 20, 20, 0xe9dcc4, 0, 0, 0));
    for (let x = -10.5; x <= 10.5; x += 3.5) g.add(prism(0.7, 13, 12, WHITE, x, 3, 10.6));
    g.add(box(28.4, 1.2, 20.4, STONE, 0, 16, 0, false));
    arcade(g, -10.5, 10.5, 3.5, 1.8, 2.6, 0.02, 10.05, DARK);
    g.add(mesh(new THREE.SphereGeometry(6.5, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), GLASS, 0, 20, 0, 0x0b2a3a));
    g.add(mesh(new THREE.TorusGeometry(1.6, 0.4, 6, 12), 0xffd166, 0, 28, 0));
    g.add(box(8, 4, 1, STONE, 0, 20, 9.6));
    for (const x of [-3, 3]) figure(g, x, 24, 9.6, 1.1, WHITE);
  },
  estacioNord: (g) => {
    // Estació del Nord (1917): the modernist brick-and-cream façade under the great arched window, its three towers
    // crowned with the eagles and the ceramic oranges and orange-blossom leaves of the Valencian orchards.
    g.add(box(50, 16, 18, 0xe9a86b, 0, 0, 0));
    g.add(box(50, 2, 18.4, CREAM, 0, 8, 0));
    for (const x of [-23, 0, 23]) g.add(box(6, 22, 18.4, BRICK, x, 0, 0));
    onWall(g, arch(14, 12, GLASS), 0, 2, 9.3);
    for (const x of [-15, -8, 8, 15]) onWall(g, arch(2.4, 5, DARK), x, 1, 9.25);
    trencadis(g, 50, 15, 9.3, [0xff8c1a, 0x2f7d32, 0xffd166]);
    for (const x of [-23, 0, 23]) {
      g.add(mesh(new THREE.SphereGeometry(1.4, 10, 8), 0xff8c1a, x, 23.4, 8.4));
      g.add(mesh(new THREE.ConeGeometry(0.9, 1.4, 6), 0x2f7d32, x + 0.8, 24.8, 8.4));
      g.add(mesh(new THREE.ConeGeometry(1.2, 2.2, 4), 0x6c757d, x, 22, -2));
    }
    g.add(box(14, 1.6, 0.3, 0x1d3557, 0, 16.6, 9.4, false));
  },
  placaBous: (g) => {
    // Plaça de Bous (1859): the neoclassical bullring, a 48-sided brick drum with four tiers of arches (384 in the
    // real building) around the sand, and the main gate.
    const drum = mesh(new THREE.CylinderGeometry(22, 22, 17, 48, 1, true), BRICK, 0, 8.5, 0);
    drum.material = toon(BRICK, { side: THREE.DoubleSide });
    g.add(drum);
    g.add(mesh(new THREE.CylinderGeometry(22.4, 22.4, 1, 48, 1, true), CREAM, 0, 17, 0));
    for (const y of [4.3, 8.1, 11.9])
      g.add(mesh(new THREE.CylinderGeometry(22.3, 22.3, 0.35, 48, 1, true), CREAM, 0, y, 0));
    const holeGeo = new THREE.BoxGeometry(1.6, 2.4, 0.4);
    const holeMat = toon(0x3d2b1f);
    for (let row = 0; row < 4; row++) {
      for (let i = 0; i < 48; i++) {
        const a = (i / 48) * Math.PI * 2;
        const h = new THREE.Mesh(holeGeo, holeMat);
        h.position.set(Math.sin(a) * 22.1, 1.6 + row * 3.8, Math.cos(a) * 22.1);
        h.rotation.y = a;
        g.add(h);
      }
    }
    g.add(box(8, 12, 2, CREAM, 0, 0, 22));
    onWall(g, arch(4, 7, DARK), 0, 0.02, 23.05);
    g.add(mesh(new THREE.CylinderGeometry(15, 15, 0.3, 32), 0xe9c46a, 0, 0.2, 0));
    g.add(mesh(new THREE.CylinderGeometry(20, 16, 6, 48, 1, true), 0x8d5524, 0, 3, 0));
  },
  mercatColon: (g) => {
    // Mercat de Colón (1916): the modernist market of the Eixample, its gable a great brick-and-iron arch with
    // trencadís and ceramic panels between two slender towers, over an iron-and-glass hall.
    g.add(box(24, 9, 30, 0xd8b48a, 0, 0, -4));
    const roof = mesh(new THREE.CylinderGeometry(12, 12, 30, 16, 1, false, -Math.PI / 2, Math.PI), 0x9fbfcf, 0, 9, -4);
    roof.rotation.x = Math.PI / 2;
    roof.scale.set(1, 1, 0.55);
    g.add(roof);
    const gable = arch(22, 20, BRICK);
    onWall(g, gable, 0, 0, 11.05);
    onWall(g, arch(16, 16, GLASS), 0, 0.5, 11.1);
    for (let i = 0; i < 9; i++)
      g.add(
        rod(
          new THREE.Vector3(-8 + i * 2, 0.5, 11.2),
          new THREE.Vector3(-8 + i * 2, 12 - Math.abs(i - 4) * 0.9, 11.2),
          0.12,
          0x444444,
        ),
      );
    trencadis(g, 22, 18.6, 11.2, [0x2a6fb0, 0xffd166, 0xe76f51, 0x3a9d23]);
    for (const x of [-12.5, 12.5]) {
      g.add(box(3, 24, 3, BRICK, x, 0, 10));
      g.add(mesh(new THREE.ConeGeometry(2, 3.4, 4), TILE_BLUE, x, 25.7, 10));
      g.add(box(3.4, 0.6, 3.4, CREAM, x, 16, 10, false));
    }
  },
  portaMar: (g) => {
    // Porta de la Mar (1946): a white stone triumphal arch in the middle of its roundabout garden, a great round
    // central arch between two lower lintelled passages, with reliefs and the bat of the city arms on top.
    g.add(mesh(new THREE.CylinderGeometry(11, 11, 0.4, 24), 0x6fa84f, 0, 0.2, 0));
    for (const x of [-9, 9]) {
      g.add(box(4, 8, 5, CREAM, x, 0, 0));
      g.add(box(2.4, 3.8, 5.2, DARK, x, 0, 0, false));
    }
    for (const x of [-4.8, 4.8]) g.add(box(3.6, 13, 5, CREAM, x, 0, 0));
    g.add(box(22, 1, 5.4, STONE, 0, 8, 0, false));
    g.add(box(13.2, 4, 5, CREAM, 0, 13, 0));
    for (const z of [-2.55, 2.55]) {
      onWall(g, arch(6, 11, DARK), 0, 0, z);
      for (const x of [-4.8, 4.8]) g.add(box(2.4, 2.4, 0.2, 0xcdb58e, x, 9.5, z * 1.02, false));
    }
    g.add(box(8, 1.5, 5.4, STONE, 0, 17, 0));
    const bat = mesh(new THREE.BoxGeometry(3, 1, 0.4), 0x333333, 0, 19.2, 0);
    g.add(bat);
    for (const k of [-1, 1]) {
      const wing = mesh(new THREE.BoxGeometry(2, 0.3, 0.3), 0x333333, k * 1.8, 19.8, 0);
      wing.rotation.z = k * 0.5;
      g.add(wing);
    }
    for (const [x, z] of [
      [-8, 7],
      [8, 7],
      [-8, -7],
      [8, -7],
    ] as const) {
      palm(g, x, z, 7);
    }
  },
};

/** Landmark model of the given kind (see the orientation note above). */
export const monumentModel = (kind: MonumentKind): THREE.Group => {
  const g = new THREE.Group();
  g.name = kind;
  models[kind](g);
  return g;
};

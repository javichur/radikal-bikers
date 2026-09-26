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

const models: Record<MonumentKind, (g: THREE.Group) => void> = {
  palauArts: (g) => {
    // White shell between two curved walls, crowned by a long steel "feather".
    const shell = mesh(new THREE.SphereGeometry(1, 16, 10), WHITE, 0, 14, 0);
    shell.scale.set(30, 16, 16);
    g.add(shell);
    for (const x of [-26, 26]) {
      const wing = mesh(new THREE.CylinderGeometry(14, 16, 4, 12, 1, false, 0, Math.PI), WHITE, x, 10, 0);
      wing.rotation.z = Math.PI / 2;
      g.add(wing);
    }
    const feather = mesh(new THREE.BoxGeometry(70, 1.2, 6), 0xd9dde3, 6, 34, 0);
    feather.rotation.z = -0.12;
    g.add(feather);
    g.add(mesh(new THREE.BoxGeometry(36, 12, 18), GLASS, 0, 6, 2, 0x0b2a3a));
  },
  hemisferic: (g) => {
    // The "eye": an elongated shell over a glass eyelid and its iris, reflected in a pond.
    const pond = mesh(new THREE.BoxGeometry(56, 0.3, 40), 0x4cc9f0, 0, 0.1, 0);
    g.add(pond);
    const shell = mesh(new THREE.SphereGeometry(1, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), WHITE, 0, 0, 0);
    shell.scale.set(24, 11, 12);
    g.add(shell);
    const lid = mesh(new THREE.SphereGeometry(1, 16, 8, 0, Math.PI, 0, Math.PI / 2), GLASS, 0, 0.2, 4, 0x103040);
    lid.scale.set(20, 8, 10);
    lid.rotation.y = -Math.PI / 2;
    g.add(lid);
    g.add(mesh(new THREE.SphereGeometry(4.5, 12, 10), 0xf4a261, 0, 4.5, 6));
  },
  museuCiencies: (g) => {
    // Long glazed hall behind a row of white concrete ribs (the whale skeleton).
    g.add(box(84, 22, 22, WHITE, 0, 0, -4));
    g.add(mesh(new THREE.BoxGeometry(80, 18, 1), GLASS, 0, 11, 7.2, 0x0b2a3a));
    for (let x = -40; x <= 40; x += 6) {
      g.add(rod(new THREE.Vector3(x, 0, 12), new THREE.Vector3(x, 26, 4), 0.9, WHITE));
    }
  },
  umbracle: (g) => {
    // Garden walkway under tall white arches, planted with palms.
    for (let x = -26; x <= 26; x += 4.5) {
      const arch = mesh(new THREE.TorusGeometry(8, 0.45, 5, 12, Math.PI), WHITE, x, 8, 0);
      arch.rotation.y = Math.PI / 2;
      arch.scale.y = 1.8;
      g.add(arch);
    }
    g.add(box(56, 0.6, 18, 0x8ab17d, 0, 0, 0, false));
    for (const x of [-18, -6, 6, 18]) {
      g.add(mesh(new THREE.CylinderGeometry(0.25, 0.35, 9, 6), 0x8d5524, x, 4.5, 0));
      const crown = mesh(new THREE.ConeGeometry(3, 1.4, 7, 1, true), 0x3a9d23, x, 9, 0);
      crown.rotation.x = Math.PI;
      g.add(crown);
    }
  },
  assutPylon: (g) => {
    // The white pylon of the cable-stayed Assut de l'Or, leaning back from the deck, with its stays.
    const pylon = mesh(new THREE.CylinderGeometry(0.8, 2.2, 62, 6), WHITE, 0, 0, 0);
    pylon.geometry.translate(0, 31, 0);
    pylon.rotation.z = -0.18;
    g.add(pylon);
    const top = new THREE.Vector3(Math.sin(0.18) * 62, Math.cos(0.18) * 62 - 2, 0);
    for (let i = 0; i < 7; i++) {
      const a = top.clone().multiplyScalar(0.55 + i * 0.07);
      g.add(rod(a, new THREE.Vector3(-18 - i * 12, 8, 7), 0.12, 0xdddddd));
    }
  },
  palauMusica: (g) => {
    // Glass barrel vault among the gardens of the riverbed.
    const vault = mesh(new THREE.CylinderGeometry(10, 10, 48, 16, 1, false, 0, Math.PI), GLASS, 0, 6, 0, 0x0b2a3a);
    vault.rotation.z = Math.PI / 2;
    vault.rotation.x = Math.PI / 2;
    g.add(vault);
    g.add(box(50, 6, 22, CREAM, 0, 0, 0));
    g.add(box(20, 0.4, 14, 0x4cc9f0, 0, 0, 16, false));
  },
  peineta: (g) => {
    // Pont de l'Exposició: a slender white arch leaning over the deck, combed with ribs.
    g.add(box(44, 1.2, 8, WHITE, 0, 6, 0));
    for (const x of [-18, 18]) g.add(box(2, 6, 6, STONE, x, 0, 0, false));
    const arch = mesh(new THREE.TorusGeometry(20, 0.8, 6, 20, Math.PI), WHITE, 0, 7, -3);
    arch.rotation.x = -0.35;
    g.add(arch);
    for (let i = 1; i < 12; i++) {
      const a = (i / 12) * Math.PI;
      const p = new THREE.Vector3(
        Math.cos(a) * 20,
        7 + Math.sin(a) * 20 * Math.cos(0.35),
        -3 - Math.sin(a) * 20 * 0.34,
      );
      g.add(rod(p, new THREE.Vector3(p.x, 7.2, 0), 0.25, WHITE));
    }
  },
  bellesArts: (g) => {
    // Brick college around a courtyard, with the blue-tiled dome of the chapel.
    g.add(box(36, 14, 24, BRICK, 0, 0, 0));
    g.add(mesh(new THREE.CylinderGeometry(6, 6, 5, 12), CREAM, 0, 16.5, 0));
    g.add(mesh(new THREE.SphereGeometry(6.2, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), TILE_BLUE, 0, 19, 0));
    g.add(mesh(new THREE.ConeGeometry(1, 3, 8), CREAM, 0, 26.5, 0));
  },
  torresSerrans: (g) => {
    // Two crenellated gothic towers flanking the gateway (the portico of the covered section spans the road).
    for (const x of [-20, 20]) {
      g.add(box(13, 26, 15, STONE, x, 0, 0));
      battlements(g, 13, 15, 26, x, 0);
      g.add(box(4, 5, 0.6, 0x3d2b1f, x - Math.sign(x) * 3, 12, 7.8, false));
    }
    g.add(box(27, 4, 15, STONE, 0, 17, 0));
    battlements(g, 27, 15, 21, 0, 0);
  },
  fontTuria: (g) => {
    // Font del Túria: round basin with the reclining river god, the Basílica dels Desamparats behind.
    g.add(mesh(new THREE.CylinderGeometry(6, 6.3, 1, 16), STONE, 0, 0.5, 0));
    g.add(mesh(new THREE.CylinderGeometry(5.6, 5.6, 0.2, 16), 0x6fc3df, 0, 1.05, 0, 0x0b3d4f));
    g.add(mesh(new THREE.BoxGeometry(3, 1.4, 1.2), 0x4a4e45, 0, 1.8, 0));
    g.add(mesh(new THREE.SphereGeometry(0.7, 8, 6), 0x4a4e45, 1.2, 2.8, 0));
    g.add(box(20, 14, 14, CREAM, 0, 0, -14));
    g.add(mesh(new THREE.SphereGeometry(6, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), TILE_BLUE, 0, 14, -14));
  },
  micalet: (g) => {
    // El Micalet: octagonal stone bell tower with its belfry and small lantern.
    g.add(mesh(new THREE.CylinderGeometry(5, 5, 34, 8), STONE, 0, 17, 0));
    g.add(mesh(new THREE.CylinderGeometry(5.3, 5.3, 6, 8, 1, true), 0xc9b48f, 0, 37, 0));
    g.add(mesh(new THREE.CylinderGeometry(2, 2, 5, 8), STONE, 0, 42, 0));
    g.add(mesh(new THREE.ConeGeometry(2.4, 3, 8), TILE_BLUE, 0, 46, 0));
    g.add(box(20, 18, 12, CREAM, 10, 0, -10));
  },
  ajuntament: (g) => {
    // Town hall: long cream façade, corner pavilions and the central clock tower.
    g.add(box(50, 20, 22, CREAM, 0, 0, 0));
    for (const x of [-22, 22]) g.add(box(8, 24, 22, CREAM, x, 0, 0));
    g.add(box(10, 34, 10, CREAM, 0, 0, 4));
    const clock = mesh(new THREE.CylinderGeometry(2.4, 2.4, 0.4, 16), 0xffffff, 0, 30, 9.3, 0x555555);
    clock.rotation.x = Math.PI / 2;
    g.add(clock);
    g.add(mesh(new THREE.SphereGeometry(4.5, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), 0x6c757d, 0, 34, 4));
    g.add(mesh(new THREE.ConeGeometry(0.6, 5, 6), 0xffd166, 0, 40, 4));
  },
  correos: (g) => {
    // Post office: stone façade with columns, topped by a glass dome and a crown.
    g.add(box(26, 20, 20, 0xe9dcc4, 0, 0, 0));
    for (let x = -9; x <= 9; x += 4.5) g.add(box(1.4, 14, 1.4, WHITE, x, 2, 10.5, false));
    g.add(mesh(new THREE.SphereGeometry(6, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), GLASS, 0, 20, 0, 0x0b2a3a));
    g.add(mesh(new THREE.TorusGeometry(1.6, 0.4, 6, 12), 0xffd166, 0, 27.5, 0));
  },
  estacioNord: (g) => {
    // Modernist station façade: brick and cream bands, crowned with oranges and their leaves.
    g.add(box(48, 16, 18, 0xe9a86b, 0, 0, 0));
    g.add(box(48, 2, 18.4, CREAM, 0, 8, 0));
    for (const x of [-22, 0, 22]) g.add(box(6, 22, 18.4, BRICK, x, 0, 0));
    for (const x of [-22, 0, 22]) {
      g.add(mesh(new THREE.SphereGeometry(1.4, 10, 8), 0xff8c1a, x, 23.4, 9));
      g.add(mesh(new THREE.ConeGeometry(0.9, 1.4, 6), 0x2f7d32, x + 0.8, 24.8, 9));
    }
    const arch = mesh(new THREE.TorusGeometry(7, 0.6, 6, 14, Math.PI), CREAM, 0, 10, 9.3);
    g.add(arch);
  },
  placaBous: (g) => {
    // Neoclassical bullring: a polygonal brick drum with four storeys of arches, open to the sky.
    const drum = mesh(new THREE.CylinderGeometry(22, 22, 17, 48, 1, true), BRICK, 0, 8.5, 0);
    drum.material = toon(BRICK, { side: THREE.DoubleSide });
    g.add(drum);
    g.add(mesh(new THREE.CylinderGeometry(22.4, 22.4, 1, 48, 1, true), CREAM, 0, 17, 0));
    const holeGeo = new THREE.BoxGeometry(1.6, 2.4, 0.4);
    const holeMat = toon(0x3d2b1f);
    for (let row = 0; row < 4; row++) {
      for (let i = 0; i < 40; i++) {
        const a = (i / 40) * Math.PI * 2;
        const h = new THREE.Mesh(holeGeo, holeMat);
        h.position.set(Math.sin(a) * 22.1, 2.4 + row * 3.8, Math.cos(a) * 22.1);
        h.rotation.y = a;
        g.add(h);
      }
    }
    g.add(mesh(new THREE.CylinderGeometry(15, 15, 0.3, 32), 0xe9c46a, 0, 0.2, 0));
  },
  portaMar: (g) => {
    // Porta de la Mar: a triumphal arch in the middle of its roundabout garden.
    g.add(mesh(new THREE.CylinderGeometry(11, 11, 0.4, 24), 0x6fa84f, 0, 0.2, 0));
    for (const x of [-5, 5]) g.add(box(4, 12, 5, CREAM, x, 0, 0));
    g.add(box(14, 4, 5, CREAM, 0, 12, 0));
    g.add(box(8, 1.5, 5.4, STONE, 0, 16, 0));
    const arch = mesh(new THREE.TorusGeometry(3, 0.5, 6, 12, Math.PI), STONE, 0, 9, 2.6);
    g.add(arch);
  },
};

/** Landmark model of the given kind (see the orientation note above). */
export const monumentModel = (kind: MonumentKind): THREE.Group => {
  const g = new THREE.Group();
  g.name = kind;
  models[kind](g);
  return g;
};

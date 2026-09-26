import * as THREE from 'three';
import type { Riverbed } from '../sim/scenery';
import { toon, toonGradient } from './materials';

const GROUND = 6000;
const CELL = 5;
/** Sandstone of the walls lining the old riverbed. */
export const RIVERBED_WALL = 0xc8b89a;

/** Axis-aligned XZ box around the sunken parts of the stage. */
export interface Bounds {
  readonly x0: number;
  readonly x1: number;
  readonly z0: number;
  readonly z1: number;
}

const quad = (pos: number[], x0: number, x1: number, z0: number, z1: number, y: number): void => {
  pos.push(x0, y, z0, x0, y, z1, x1, y, z1, x0, y, z0, x1, y, z1, x1, y, z0);
};

/**
 * Ground of the stage. Flat when there is no riverbed; otherwise the plane keeps a rectangular hole around the bed,
 * filled with a grid whose sunken vertices drop to the floor: the lawn at the bottom, stone walls on the slopes.
 */
export const buildGround = (
  color: number,
  lawn: number,
  riverbed: Riverbed | null,
  bounds: Bounds | null,
): THREE.Mesh[] => {
  if (!riverbed || !bounds) {
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(GROUND, GROUND), toon(color));
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.05;
    ground.receiveShadow = true;
    return [ground];
  }
  const h = GROUND / 2;
  const nx = Math.ceil((bounds.x1 - bounds.x0) / CELL);
  const nz = Math.ceil((bounds.z1 - bounds.z0) / CELL);
  const x0 = bounds.x0;
  const z0 = bounds.z0;
  const x1 = x0 + nx * CELL;
  const z1 = z0 + nz * CELL;

  const frame: number[] = [];
  quad(frame, -h, h, -h, z0, -0.05);
  quad(frame, -h, h, z1, h, -0.05);
  quad(frame, -h, x0, z0, z1, -0.05);
  quad(frame, x1, h, z0, z1, -0.05);
  const frameGeo = new THREE.BufferGeometry();
  frameGeo.setAttribute('position', new THREE.Float32BufferAttribute(frame, 3));
  frameGeo.computeVertexNormals();
  const outside = new THREE.Mesh(frameGeo, toon(color));
  outside.receiveShadow = true;

  const sunk: boolean[] = [];
  for (let j = 0; j <= nz; j++) {
    for (let i = 0; i <= nx; i++) sunk.push(riverbed.sunk(x0 + i * CELL, z0 + j * CELL));
  }
  const at = (i: number, j: number): boolean =>
    sunk[Math.max(0, Math.min(nz, j)) * (nx + 1) + Math.max(0, Math.min(nx, i))]!;
  const pos: number[] = [];
  const col: number[] = [];
  const cGround = new THREE.Color(color);
  const cLawn = new THREE.Color(lawn);
  const cWall = new THREE.Color(RIVERBED_WALL);
  for (let j = 0; j <= nz; j++) {
    for (let i = 0; i <= nx; i++) {
      const down = at(i, j);
      pos.push(x0 + i * CELL, down ? -riverbed.depth : -0.05, z0 + j * CELL);
      // Vertices on the edge of the bed belong to the walls (stone), the rest to the lawn or the streets.
      const edge = at(i - 1, j) !== down || at(i + 1, j) !== down || at(i, j - 1) !== down || at(i, j + 1) !== down;
      const c = edge ? cWall : down ? cLawn : cGround;
      col.push(c.r, c.g, c.b);
    }
  }
  const idx: number[] = [];
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const a = j * (nx + 1) + i;
      const b = a + nx + 1;
      idx.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const bed = new THREE.Mesh(
    geo,
    new THREE.MeshToonMaterial({ color: 0xffffff, vertexColors: true, gradientMap: toonGradient() }),
  );
  bed.receiveShadow = true;
  return [outside, bed];
};

/** Bounding box of the parks and rivers, padded by `margin`. */
export const boundsOf = (points: readonly (readonly [number, number])[], margin: number): Bounds | null => {
  if (points.length === 0) return null;
  const xs = points.map((p) => p[0]);
  const zs = points.map((p) => p[1]);
  return {
    x0: Math.min(...xs) - margin,
    x1: Math.max(...xs) + margin,
    z0: Math.min(...zs) - margin,
    z1: Math.max(...zs) + margin,
  };
};

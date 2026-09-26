import * as THREE from 'three';

/**
 * Fake lights for the night stages: additive, see-through shapes whose brightness fades out through a per-vertex alpha
 * (light pools on the road, headlight beams, lamp cones). Much cheaper than real lights and no textures needed.
 */

export const LAMP_LIGHT = 0xffe29a;
export const HEADLIGHT = 0xfff1c1;
export const TAIL_LIGHT = 0xff2a2a;

const cache = new Map<number, THREE.MeshBasicMaterial>();

export const glowMaterial = (color: number): THREE.MeshBasicMaterial => {
  let m = cache.get(color);
  if (!m) {
    m = new THREE.MeshBasicMaterial({
      color,
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    cache.set(color, m);
  }
  return m;
};

const setAlpha = (geo: THREE.BufferGeometry, alpha: (i: number) => number): THREE.BufferGeometry => {
  const n = geo.getAttribute('position').count;
  const colors = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) colors.set([1, 1, 1, alpha(i)], i * 4);
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 4));
  return geo;
};

/** Round pool of light lying flat on the ground (XZ plane), brightest at the centre. */
export const poolGeometry = (radius: number, alpha: number): THREE.BufferGeometry => {
  const geo = new THREE.CircleGeometry(radius, 24);
  geo.rotateX(-Math.PI / 2);
  // CircleGeometry puts the centre vertex first.
  return setAlpha(geo, (i) => (i === 0 ? alpha : 0));
};

/** Flat headlight beam on the ground, from z = 0 (near, `nearWidth`) to z = `length` (far, `farWidth`). */
export const beamGeometry = (
  nearWidth: number,
  farWidth: number,
  length: number,
  alpha: number,
): THREE.BufferGeometry => {
  const geo = new THREE.BufferGeometry();
  const n = nearWidth / 2;
  const f = farWidth / 2;
  geo.setAttribute('position', new THREE.Float32BufferAttribute([-n, 0, 0, n, 0, 0, f, 0, length, -f, 0, length], 3));
  geo.setIndex([0, 2, 1, 0, 3, 2]);
  return setAlpha(geo, (i) => (i < 2 ? alpha : 0));
};

/** Open cone of light hanging from a lamp at `height` down to the ground (y = 0). */
export const coneGeometry = (
  topRadius: number,
  bottomRadius: number,
  height: number,
  alpha: number,
): THREE.BufferGeometry => {
  const geo = new THREE.CylinderGeometry(topRadius, bottomRadius, height, 12, 1, true);
  geo.translate(0, height / 2, 0);
  const pos = geo.getAttribute('position');
  return setAlpha(geo, (i) => (pos.getY(i) > height / 2 ? alpha : 0));
};

/** Placement matrix for a flat light pool on a road point, tilted with the road gradient. */
export const poolMatrix = (
  p: { readonly x: number; readonly y: number; readonly z: number; readonly heading: number },
  slope: number,
  lift = 0.05,
): THREE.Matrix4 => {
  const e = new THREE.Euler(-Math.atan(slope), p.heading, 0, 'YXZ');
  return new THREE.Matrix4().compose(
    new THREE.Vector3(p.x, p.y + lift, p.z),
    new THREE.Quaternion().setFromEuler(e),
    new THREE.Vector3(1, 1, 1),
  );
};

/** Instanced glow shapes (one draw call) from a list of placement matrices. */
export const glowInstances = (
  geo: THREE.BufferGeometry,
  color: number,
  matrices: readonly THREE.Matrix4[],
): THREE.InstancedMesh => {
  const mesh = new THREE.InstancedMesh(geo, glowMaterial(color), Math.max(1, matrices.length));
  matrices.forEach((m, i) => mesh.setMatrixAt(i, m));
  mesh.count = matrices.length;
  mesh.renderOrder = 1;
  mesh.frustumCulled = false;
  return mesh;
};

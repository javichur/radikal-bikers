import * as THREE from 'three';

let gradient: THREE.DataTexture | null = null;

/** 3-band ramp for the cel-shaded look. */
export const toonGradient = (): THREE.DataTexture => {
  if (gradient) return gradient;
  const data = new Uint8Array([90, 90, 90, 255, 170, 170, 170, 255, 255, 255, 255, 255]);
  gradient = new THREE.DataTexture(data, 3, 1, THREE.RGBAFormat);
  gradient.minFilter = THREE.NearestFilter;
  gradient.magFilter = THREE.NearestFilter;
  gradient.needsUpdate = true;
  return gradient;
};

const cache = new Map<string, THREE.MeshToonMaterial>();

export const toon = (
  color: number,
  opts: { map?: THREE.Texture; emissive?: number; emissiveMap?: THREE.Texture; side?: THREE.Side } = {},
): THREE.MeshToonMaterial => {
  const key = `${color}:${opts.map?.uuid ?? ''}:${opts.emissive ?? ''}:${opts.emissiveMap?.uuid ?? ''}:${opts.side ?? ''}`;
  let m = cache.get(key);
  if (!m) {
    m = new THREE.MeshToonMaterial({
      color,
      gradientMap: toonGradient(),
      map: opts.map ?? null,
      side: opts.side ?? THREE.FrontSide,
    });
    if (opts.emissive !== undefined) m.emissive = new THREE.Color(opts.emissive);
    if (opts.emissiveMap) m.emissiveMap = opts.emissiveMap;
    cache.set(key, m);
  }
  return m;
};

const outlineMat = new THREE.MeshBasicMaterial({ color: 0x151522, side: THREE.BackSide });

/** Inverted-hull outline for the comic-book look. */
export const withOutline = (mesh: THREE.Mesh, thickness = 0.06): THREE.Group => {
  const g = new THREE.Group();
  const outline = new THREE.Mesh(mesh.geometry, outlineMat);
  mesh.geometry.computeBoundingBox();
  const size = new THREE.Vector3();
  mesh.geometry.boundingBox!.getSize(size);
  outline.scale.set(
    1 + thickness / Math.max(size.x, 0.01),
    1 + thickness / Math.max(size.y, 0.01),
    1 + thickness / Math.max(size.z, 0.01),
  );
  outline.position.copy(mesh.position);
  outline.rotation.copy(mesh.rotation);
  outline.scale.multiply(mesh.scale);
  g.add(outline, mesh);
  return g;
};

export const canvasTexture = (
  w: number,
  h: number,
  draw: (ctx: CanvasRenderingContext2D) => void,
): THREE.CanvasTexture => {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  if (ctx) draw(ctx);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
};

export const box = (w: number, h: number, d: number, color: number, y = h / 2): THREE.Mesh => {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), toon(color));
  m.position.y = y;
  m.castShadow = true;
  return m;
};

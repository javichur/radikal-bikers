import * as THREE from 'three';
import { canvasTexture } from './materials';

const repeat = (t: THREE.Texture): THREE.Texture => {
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  return t;
};

export const roadTexture = (
  halfWidth: number,
  forward: readonly number[],
  oncoming: readonly number[],
  opts: { readonly cobbles?: boolean; readonly rails?: readonly number[] } = {},
): THREE.Texture => {
  const W = 512;
  const H = 256;
  const tex = canvasTexture(W, H, (c) => {
    c.fillStyle = opts.cobbles ? '#6b6258' : '#3b3f4a';
    c.fillRect(0, 0, W, H);
    const x = (d: number): number => ((d + halfWidth) / (halfWidth * 2)) * W;
    if (opts.cobbles) {
      // Setts in staggered rows.
      for (let row = 0; row < H / 8; row++) {
        for (let col = -1; col < W / 12; col++) {
          const l = 38 + Math.random() * 14;
          c.fillStyle = `hsl(30, 10%, ${l}%)`;
          c.fillRect(col * 12 + (row % 2) * 6 + 1, row * 8 + 1, 10, 6);
        }
      }
    }
    for (let i = 0; i < 900; i++) {
      c.fillStyle = `rgba(255,255,255,${Math.random() * 0.05})`;
      c.fillRect(Math.random() * W, Math.random() * H, 2, 2);
    }
    // Tram tracks: a pair of steel rails (standard gauge) along each lane that has them.
    for (const lane of opts.rails ?? []) {
      for (const k of [-0.72, 0.72]) {
        c.fillStyle = '#2b2b2b';
        c.fillRect(x(lane + k) - 4, 0, 8, H);
        c.fillStyle = '#b8b8b8';
        c.fillRect(x(lane + k) - 1.5, 0, 3, H);
      }
    }
    c.fillStyle = '#f1f1f1';
    c.fillRect(x(-halfWidth + 0.3), 0, 6, H);
    c.fillRect(x(halfWidth - 0.3) - 6, 0, 6, H);
    c.fillStyle = '#ffd166';
    c.fillRect(x(0) - 9, 0, 6, H);
    c.fillRect(x(0) + 3, 0, 6, H);
    c.fillStyle = '#f1f1f1';
    const seps = [...forward, ...oncoming]
      .sort((a, b) => a - b)
      .reduce<number[]>((acc, d, i, arr) => {
        const next = arr[i + 1];
        if (next !== undefined && Math.sign(d) === Math.sign(next)) acc.push((d + next) / 2);
        return acc;
      }, []);
    for (const d of seps) c.fillRect(x(d) - 3, 0, 6, H * 0.5);
  });
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
};

/** Corrugated metal cladding of a warehouse, with a roller door band at the bottom. */
export const shedTexture = (): THREE.Texture =>
  repeat(
    canvasTexture(128, 128, (c) => {
      c.fillStyle = '#f2f2f2';
      c.fillRect(0, 0, 128, 128);
      for (let x = 0; x < 128; x += 8) {
        c.fillStyle = 'rgba(0,0,0,0.12)';
        c.fillRect(x, 0, 3, 128);
      }
      c.fillStyle = 'rgba(0,0,0,0.25)';
      c.fillRect(0, 100, 128, 3);
      c.fillStyle = 'rgba(40,60,90,0.45)';
      c.fillRect(8, 12, 112, 10);
    }),
  );

/** Country track: packed earth with wheel ruts and pebbles. */
export const dirtTexture = (): THREE.Texture =>
  repeat(
    canvasTexture(128, 256, (c) => {
      c.fillStyle = '#9c7a52';
      c.fillRect(0, 0, 128, 256);
      for (let i = 0; i < 500; i++) {
        c.fillStyle = `rgba(${Math.random() < 0.5 ? '255,240,210' : '60,40,20'},${0.1 + Math.random() * 0.2})`;
        c.fillRect(Math.random() * 128, Math.random() * 256, 2 + Math.random() * 3, 2 + Math.random() * 3);
      }
      c.fillStyle = 'rgba(70,45,20,0.35)';
      for (const x of [34, 88]) c.fillRect(x, 0, 8, 256);
      c.fillStyle = 'rgba(110,150,70,0.5)';
      c.fillRect(60, 0, 6, 256);
    }),
  );

/** Narrow back-street asphalt with patches and a faded centre line. */
export const alleyTexture = (): THREE.Texture =>
  repeat(
    canvasTexture(128, 256, (c) => {
      c.fillStyle = '#4a4744';
      c.fillRect(0, 0, 128, 256);
      for (let i = 0; i < 14; i++) {
        c.fillStyle = `rgba(0,0,0,${0.08 + Math.random() * 0.1})`;
        c.fillRect(Math.random() * 110, Math.random() * 240, 10 + Math.random() * 30, 8 + Math.random() * 24);
      }
      c.fillStyle = 'rgba(255,255,255,0.45)';
      c.fillRect(61, 0, 6, 110);
      c.fillStyle = '#6b6560';
      c.fillRect(0, 0, 6, 256);
      c.fillRect(122, 0, 6, 256);
    }),
  );

/** Building facade with windows, and a matching glow map with only the lit windows (for night stages). */
export const windowTextures = (): { map: THREE.Texture; glow: THREE.Texture } => {
  const cells: [number, number, boolean][] = [];
  for (let y = 12; y < 250; y += 28) for (let x = 10; x < 120; x += 28) cells.push([x, y, Math.random() < 0.25]);
  const map = repeat(
    canvasTexture(128, 256, (c) => {
      c.fillStyle = '#ffffff';
      c.fillRect(0, 0, 128, 256);
      for (const [x, y, lit] of cells) {
        c.fillStyle = lit ? '#fff3c4' : '#5b6b8c';
        c.fillRect(x, y, 16, 16);
      }
      c.fillStyle = 'rgba(0,0,0,0.15)';
      c.fillRect(0, 250, 128, 6);
    }),
  );
  const glow = repeat(
    canvasTexture(128, 256, (c) => {
      c.fillStyle = '#000000';
      c.fillRect(0, 0, 128, 256);
      c.fillStyle = '#ffd98a';
      for (const [x, y, lit] of cells) if (lit) c.fillRect(x, y, 16, 16);
    }),
  );
  return { map, glow };
};

export const brickTexture = (): THREE.Texture =>
  repeat(
    canvasTexture(128, 64, (c) => {
      c.fillStyle = '#b5654a';
      c.fillRect(0, 0, 128, 64);
      c.fillStyle = '#8c4a36';
      for (let row = 0; row < 8; row++) {
        c.fillRect(0, row * 8, 128, 1);
        for (let x = (row % 2) * 8; x < 128; x += 16) c.fillRect(x, row * 8, 1, 8);
      }
      c.fillStyle = 'rgba(40,40,60,0.55)';
      c.font = 'bold 18px sans-serif';
      c.fillText(Math.random() < 0.5 ? 'RR!' : '★', 20 + Math.random() * 60, 40);
    }),
  );

export const bannerTexture = (text: string, checkered = false): THREE.Texture =>
  canvasTexture(512, 96, (c) => {
    if (checkered) {
      for (let x = 0; x < 512; x += 24)
        for (let y = 0; y < 96; y += 24) {
          c.fillStyle = (x + y) % 48 === 0 ? '#111' : '#fff';
          c.fillRect(x, y, 24, 24);
        }
      c.fillStyle = 'rgba(230,57,70,0.9)';
      c.fillRect(96, 16, 320, 64);
    } else {
      c.fillStyle = '#e63946';
      c.fillRect(0, 0, 512, 96);
      c.fillStyle = '#ffd166';
      c.fillRect(0, 0, 512, 8);
      c.fillRect(0, 88, 512, 8);
    }
    c.fillStyle = '#fff';
    c.font = 'bold 56px "Trebuchet MS", sans-serif';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(text, 256, 50);
  });

export const stripeTexture = (): THREE.Texture =>
  repeat(
    canvasTexture(64, 64, (c) => {
      c.fillStyle = '#ffd166';
      c.fillRect(0, 0, 64, 64);
      c.fillStyle = '#222';
      for (let i = -64; i < 128; i += 22) {
        c.beginPath();
        c.moveTo(i, 0);
        c.lineTo(i + 11, 0);
        c.lineTo(i + 75, 64);
        c.lineTo(i + 64, 64);
        c.fill();
      }
    }),
  );

export const awningTexture = (color: string): THREE.Texture =>
  repeat(
    canvasTexture(64, 16, (c) => {
      for (let x = 0; x < 64; x += 16) {
        c.fillStyle = color;
        c.fillRect(x, 0, 8, 16);
        c.fillStyle = '#ffffff';
        c.fillRect(x + 8, 0, 8, 16);
      }
    }),
  );

export const signTexture = (text: string, bg: string, fg = '#ffffff'): THREE.Texture =>
  canvasTexture(512, 128, (c) => {
    c.fillStyle = bg;
    c.fillRect(0, 0, 512, 128);
    c.strokeStyle = fg;
    c.lineWidth = 8;
    c.strokeRect(10, 10, 492, 108);
    c.fillStyle = fg;
    c.font = 'bold 76px "Trebuchet MS", sans-serif';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(text, 256, 68);
  });

export const tileTexture = (): THREE.Texture =>
  repeat(
    canvasTexture(64, 64, (c) => {
      for (let y = 0; y < 64; y += 16)
        for (let x = 0; x < 64; x += 16) {
          c.fillStyle = (x + y) % 32 === 0 ? '#f4f1ea' : '#c9c3b8';
          c.fillRect(x, y, 16, 16);
        }
    }),
  );

/** Supermarket shelf front: rows of colourful products. */
export const shelfTexture = (): THREE.Texture =>
  canvasTexture(128, 128, (c) => {
    c.fillStyle = '#e9ecef';
    c.fillRect(0, 0, 128, 128);
    const colors = ['#e63946', '#ffd166', '#06d6a0', '#118ab2', '#f78c6b', '#8338ec'];
    for (let row = 0; row < 4; row++) {
      c.fillStyle = '#adb5bd';
      c.fillRect(0, row * 32 + 28, 128, 4);
      for (let x = 2; x < 124; x += 12) {
        c.fillStyle = colors[Math.floor(Math.random() * colors.length)]!;
        const h = 14 + Math.random() * 12;
        c.fillRect(x, row * 32 + 28 - h, 10, h);
      }
    }
  });

/** Explosive bonus crate. */
export const tntTexture = (): THREE.Texture =>
  canvasTexture(128, 128, (c) => {
    c.fillStyle = '#c1121f';
    c.fillRect(0, 0, 128, 128);
    c.strokeStyle = '#ffd166';
    c.lineWidth = 10;
    c.strokeRect(5, 5, 118, 118);
    c.fillStyle = '#ffd166';
    c.font = 'bold 48px "Trebuchet MS", sans-serif';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText('TNT', 64, 58);
    c.font = 'bold 22px sans-serif';
    c.fillText('BOOM!', 64, 98);
  });

export const concreteTexture = (): THREE.Texture =>
  repeat(
    canvasTexture(64, 64, (c) => {
      c.fillStyle = '#b8b0a4';
      c.fillRect(0, 0, 64, 64);
      for (let i = 0; i < 120; i++) {
        c.fillStyle = `rgba(0,0,0,${Math.random() * 0.08})`;
        c.fillRect(Math.random() * 64, Math.random() * 64, 2, 2);
      }
      c.fillStyle = 'rgba(0,0,0,0.12)';
      c.fillRect(0, 62, 64, 2);
    }),
  );

export const waterTexture = (): THREE.Texture =>
  repeat(
    canvasTexture(128, 128, (c) => {
      c.fillStyle = '#2f7fc1';
      c.fillRect(0, 0, 128, 128);
      c.strokeStyle = 'rgba(255,255,255,0.35)';
      c.lineWidth = 3;
      for (let i = 0; i < 12; i++) {
        const x = Math.random() * 128;
        const y = Math.random() * 128;
        c.beginPath();
        c.moveTo(x, y);
        c.quadraticCurveTo(x + 8, y - 4, x + 16, y);
        c.stroke();
      }
    }),
  );

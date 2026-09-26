import * as THREE from 'three';

interface Particle {
  readonly mesh: THREE.Mesh;
  readonly vel: THREE.Vector3;
  readonly spin: THREE.Vector3;
  life: number;
  readonly maxLife: number;
  readonly gravity: number;
  readonly grow: number;
}

const MAX_PARTICLES = 260;

/** Lightweight particle bursts: explosions, flying glass and bonus sparkles. */
export class Effects {
  private readonly particles: Particle[] = [];
  private readonly shard = new THREE.PlaneGeometry(0.35, 0.25);
  private readonly chunk = new THREE.IcosahedronGeometry(0.5, 0);
  private readonly cube = new THREE.BoxGeometry(0.3, 0.3, 0.3);

  constructor(private readonly scene: THREE.Scene) {}

  private spawn(
    geo: THREE.BufferGeometry,
    color: number,
    pos: THREE.Vector3,
    vel: THREE.Vector3,
    life: number,
    opts: { gravity?: number; grow?: number; opacity?: number; scale?: number } = {},
  ): void {
    if (this.particles.length >= MAX_PARTICLES) this.remove(0);
    const mat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: opts.opacity ?? 1,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(pos);
    mesh.scale.setScalar(opts.scale ?? 1);
    mesh.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
    this.scene.add(mesh);
    this.particles.push({
      mesh,
      vel,
      spin: new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(12),
      life: life,
      maxLife: life,
      gravity: opts.gravity ?? 0,
      grow: opts.grow ?? 0,
    });
  }

  private remove(i: number): void {
    const p = this.particles[i]!;
    this.scene.remove(p.mesh);
    (p.mesh.material as THREE.Material).dispose();
    this.particles.splice(i, 1);
  }

  private static rand(spread: number, up = 0): THREE.Vector3 {
    return new THREE.Vector3(
      (Math.random() - 0.5) * spread,
      Math.random() * spread * 0.5 + up,
      (Math.random() - 0.5) * spread,
    );
  }

  explosion(at: THREE.Vector3): void {
    const colors = [0xfff3b0, 0xffd166, 0xff7b00, 0xe63946];
    for (let i = 0; i < 26; i++) {
      this.spawn(this.chunk, colors[i % colors.length]!, at, Effects.rand(14, 3), 0.6 + Math.random() * 0.4, {
        grow: 3,
        gravity: -2,
        scale: 0.8 + Math.random(),
      });
    }
    for (let i = 0; i < 14; i++) {
      this.spawn(this.cube, 0x343a40, at, Effects.rand(18, 6), 1.4, { gravity: 20, scale: 0.6 + Math.random() });
    }
    for (let i = 0; i < 8; i++) {
      this.spawn(this.chunk, 0x495057, at.clone().add(new THREE.Vector3(0, 1, 0)), Effects.rand(3, 2), 1.8, {
        grow: 2.5,
        gravity: -3,
        opacity: 0.6,
        scale: 1.2,
      });
    }
  }

  glass(at: THREE.Vector3, push: THREE.Vector3): void {
    for (let i = 0; i < 40; i++) {
      const p = at
        .clone()
        .add(new THREE.Vector3((Math.random() - 0.5) * 3, Math.random() * 3 - 1, (Math.random() - 0.5) * 3));
      const v = push.clone().add(Effects.rand(8, 1));
      this.spawn(this.shard, i % 3 === 0 ? 0xffffff : 0xa8dadc, p, v, 1.2, {
        gravity: 18,
        opacity: 0.85,
        scale: 0.5 + Math.random(),
      });
    }
  }

  sparkle(at: THREE.Vector3): void {
    for (let i = 0; i < 20; i++) {
      this.spawn(this.cube, i % 2 ? 0xffd166 : 0xff7b00, at, Effects.rand(8, 2), 0.7, { gravity: 4, scale: 0.4 });
    }
  }

  update(dt: number): void {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i]!;
      p.life -= dt;
      if (p.life <= 0) {
        this.remove(i);
        continue;
      }
      p.vel.y -= p.gravity * dt;
      p.vel.multiplyScalar(Math.max(0, 1 - dt * 1.5));
      p.mesh.position.addScaledVector(p.vel, dt);
      p.mesh.rotation.x += p.spin.x * dt;
      p.mesh.rotation.y += p.spin.y * dt;
      p.mesh.rotation.z += p.spin.z * dt;
      if (p.grow) p.mesh.scale.multiplyScalar(1 + p.grow * dt);
      const mat = p.mesh.material as THREE.MeshBasicMaterial;
      mat.opacity = Math.min(mat.opacity, p.life / p.maxLife + 0.05);
    }
  }

  clear(): void {
    while (this.particles.length) this.remove(this.particles.length - 1);
  }
}
